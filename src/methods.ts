import * as R from 'rambda'

import { firestore } from './platformic'
import {
    deepObjectsDiff,
    deepObjectToStringArray,
} from './routines'
import { uploadAttachments } from './upload'


export const upload = uploadAttachments


interface SaveArgs {
    id: string
    prev?: any
    next: any
    path: string
    isNew: boolean
    schema?: any
    timestampFieldNames: any
    diffCalculated?: boolean
    uploadFn: any
}
export const save = async ({
    id,
    prev = {},
    next = {},
    path,
    isNew,
    schema = {},
    timestampFieldNames,
    diffCalculated = false,
    uploadFn,
}: SaveArgs) => {
    try {
        // console.log(isNew ? 'create' : 'update', { id, path, prev: JSON.parse(JSON.stringify(prev)), next: JSON.parse(JSON.stringify(next)) })
        const updateData: any = diffCalculated || isNew
            ? next
            : deepObjectsDiff(prev, next, '__ref').diff
        // : deepObjectsDiff(prev, next).diff
        // TODO: Convert to 'field1.field2.field3' notation
        //       to prevent damage of multi - level stuctures
        if (!diffCalculated) console.debug('FirestoreClient/save()', isNew ? 'create' : 'update', 'diff:', `/${path}/${id}`, JSON.parse(JSON.stringify(updateData)))
        // if(!diffCalculated) console.log('updateData', path, id, {...updateData})
        if (Object.keys(updateData).length) {
            const now = new Date().toISOString()
            if (isNew) {
                updateData[timestampFieldNames.createdAt] = now
                updateData.id = id
            }
            await Promise.all(Object.keys(updateData).map(async (key: string) => {
                if (updateData[key] === undefined) {
                    delete updateData[key]
                    return
                }
                const localUpdateData = updateData[key] || {}
                const localSchema = schema[key] || {}

                let ref
                let { __ref = undefined } = next[key] || {}
                const { __ref: __refPrev = 'N/A' } = prev[key] || {}
                const isNewRef = !__ref && localSchema._isReference === true
                // console.log('FirestoreClient/save() __', { path, isNewRef, hasRef: !!__ref, isReference: localSchema._isReference === true, localUpdateData: { ...localUpdateData } })
                if (isNewRef) {
                    __ref = `${path}/${id}/${key}/${id}`
                    ref = firestore().collection(`${path}/${id}/${key}`).doc(id)
                } else if (__ref) {
                    // console.log('updateData ref', key, __ref)
                    ref = firestore().doc(__ref)
                }
                if (ref) {
                    delete localUpdateData.__ref
                    updateData[key] = ref
                    // console.log('updateData ref', key, __ref, Object.keys(localUpdateData).length, localUpdateData, ref)
                    if (Object.keys(localUpdateData).length) {
                        const pathParts = __ref.split('/')
                        const id = pathParts.pop()
                        await save({
                            diffCalculated: true,
                            id,
                            isNew: isNewRef,
                            next: localUpdateData,
                            path: pathParts.join('/'),
                            schema: localSchema,
                            timestampFieldNames,
                            uploadFn,
                        })
                    }
                    if (__ref === __refPrev) delete updateData[key]
                    /* Update the value in the store */
                    prev[key] = {
                        ...prev[key],
                        ...localUpdateData,
                    }
                } else {
                    const uploadPath = localSchema._uploadPath
                    // console.log('updateData upload?', key, localUpdateData, localSchema, uploadPath, typeof uploadFn)
                    if (!uploadPath || typeof uploadFn !== 'function') return

                    updateData[key] = await uploadFn(
                        id,
                        localUpdateData,
                        uploadPath,
                    )
                }
            }))
            updateData[timestampFieldNames.updatedAt] = now

            console.debug('FirestoreClient/save() data to save:', `/${path}/${id}`, { ...updateData })
            try {
                await firestore().collection(path).doc(id).update(updateData)
                // console.debug('FirestoreClient/save() update()')
            } catch (e) {
                await firestore().collection(path).doc(id).set(updateData)
                // console.debug('FirestoreClient/save() set()', e.message)
            }
        }
        return { data: { ...updateData, ...next, id } }
    } catch (e) {
        throw e
    }
}

export const del = async (id: string, path: string, schema: any) => {
    try {
        // if(uploadFields.length) {
        //     uploadFields.map((fieldName: string) =>
        //         storage().ref().child(`${path}/${id}/${fieldName}`).delete())
        // }
        // console.log('FireStore/delete()', `${path}/${id}`)
        // TODO: Remove (by demand) attachmemts and subcolleclints
        await firestore().collection(path).doc(id).delete()
        return { data: id }
    } catch (e) {
        throw e
    }
}

export const getItemID = (
    itemId: string,
    isNew: boolean,
    path: string,
    collection: any,
) => {
    // console.log('FireStore/getItemID()', `${path}/${itemId}`)
    if (!itemId) itemId = firestore().collection(path).doc().id
    if (!itemId) throw new Error('ID is required')
    if (isNew && collection && collection[itemId]) throw new Error('ID already in use')
    return itemId
}

export const getOne = (id: string, resourceData: any) => {
    // console.log('getOne', id, resourceData)
    return { data: id && resourceData[id] ? { ...resourceData[id], id } : undefined }
    // else throw new Error('Key not found')
}


// const FILTER_IGNORE_FIELDS = ['__ref', 'id', '_id', 'createdAt', 'updatedAt']
// const FILTER_IGNORE_FIELDS = ['__ref', 'id', '_id']
const FILTER_IGNORE_FIELDS = ['__ref']
export const getMany = async (params: any, resourceData: any) => {
    /** GET_MANY */
    let data: any = {}

    // console.log('getMany', params, resourceData)
    if (params.ids) {
        params.ids.forEach((id: string) => {
            if (resourceData[id]) data[id] = resourceData[id]
        })
    } else {
        data = resourceData
    }
    /* Ensure that all returned items have 'id' field */
    Object.keys(data).forEach((id: string) => data[id].id = id)

    type FilterFn = (item: any) => boolean
    // console.log('getMany initial filters', params.filter)
    const filters: FilterFn[] = Object.values(params.filter || {})
        .filter((f: any) => typeof f === 'string' || typeof f === 'function')
        .map((f: any) => {
            if (typeof f !== 'string') return f

            const normalizedF = f.toLocaleLowerCase().replace(/"/g, '').trim()
            return (item: any) => {
                // @ts-ignore
                const value = R.path(f, item)
                if (typeof value !== 'undefined') {
                    return typeof value === 'string'
                        ? (value as string).toLocaleLowerCase().indexOf(normalizedF) > -1
                        : false
                }
                const json = JSON.stringify(deepObjectToStringArray(item, FILTER_IGNORE_FIELDS)).replace(/\\"/g, '')
                return json.toLocaleLowerCase().includes(normalizedF)
            }
        })
    if (params.target && params.id) {
        filters.unshift((item: any) => R.path(params.target, item) === params.id)
    }
    // console.debug('getMany filters', filters)

    let values = Object.values(data)
    if (filters.length) {
        values = values.filter(
            (item: any) => filters.reduce<boolean>(
                (result, f) => result && f(item),
                true,
            ),
        )
    }

    const { page = 1, perPage = values.length } = params.pagination || {}
    const _start = (page - 1) * perPage
    const _end = page * perPage
    values = values.slice(_start, _end)

    return {
        data: values,
        ids: values.map((item: any) => item.id),
        total: values.length,
    }
}
