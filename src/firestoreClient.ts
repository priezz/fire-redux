import * as R from 'rambda'

import {
    getUserId,
    runOnLogin,
    runOnLogout,
    runOnRolesChange,
} from './auth/client'
import {
    CREATE,
    DELETE,
    GET_LIST,
    GET_MANY,
    GET_MANY_REFERENCE,
    GET_ONE,
    // refreshView,
    UPDATE,
} from './constants'
import * as Methods from './methods'
import { firebase, firestore } from './platformic'
import {
    deepClone,
    nextFrame,
    mapInFrames,
    runAsync,
} from './routines'
import {
    Actions,
    getState,
} from './state'


/* Functions */
const upload = Methods.upload
const save = Methods.save
const del = Methods.del
const getItemID = Methods.getItemID
const getOne = Methods.getOne
const getMany = Methods.getMany


interface ResourceDef {
    authRequired: boolean
    document?: (() => string) | string
    filter?: (() => any[]) | any[]
    hooks: any[]
    limit?: number
    minSyncInterval?: number
    path?: (() => string) | string
    priority?: number
    schema?: any
    sortField?: (() => string) | string
    sortDirection?: string
}
interface ResourceMeta extends ResourceDef { // TODO: Extend ResourceDef type
    readyHook?: () => void
    path: (() => string) | string
    ref?: any
    unsubscribe?: () => void
}

const BaseConfiguration = {
    // initialQueryTimeout: 10000,
    timestampFieldNames: {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
    },
}
interface ClientOptions {
    timestampFieldNames?: any,
    trackedResources: { [key: string]: ResourceDef },
}


export default class FirestoreClient {
    public timestampFieldNames: any
    private _resourcesMeta: { [key: string]: ResourceMeta } = {}
    private _subscriptionQueue: string[] = []
    private _subscriptionQueueAuth: string[] = []

    constructor(options: ClientOptions, firebaseConfig: any) {
        if (firebaseConfig && firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig)
        }
        if (firebaseConfig && firebaseConfig.firestore) {
            firestore().settings(firebaseConfig.firestore)
        }

        const _options = { ...BaseConfiguration, ...options }
        this.timestampFieldNames = _options.timestampFieldNames
        console.debug('[FirestoreClient] constructor()')
        const { trackedResources } = _options
        Object.keys(trackedResources).forEach((resourceName: string) => {
            const { authRequired = false, hooks = [], path = resourceName, priority = 0, schema = {} } = trackedResources[resourceName]
            // console.log('[FirestoreClient] init() New resource -', resourceName)
            this._resourcesMeta[resourceName] = {
                ...trackedResources[resourceName],
                authRequired,
                hooks,
                path,
                priority,
                schema,
            }
            // Actions.resources.updateData({ resource: resourceName, data: {} })
        })
    }

    public startSync() {
        console.debug('[FirestoreClient] startSync()')

        const sortFn = (a: string, b: string) => (this._resourcesMeta[a].priority || 0) - (this._resourcesMeta[b].priority || 0)
        if (getUserId()) {
            this._subscriptionQueue = Object.keys(this._resourcesMeta).sort(sortFn)
        } else {
            this._subscriptionQueue = Object.keys(this._resourcesMeta)
                .filter((key: string) => !this._resourcesMeta[key].authRequired)
                .sort(sortFn)
            this._subscriptionQueueAuth = Object.keys(this._resourcesMeta)
                .filter((key: string) => this._resourcesMeta[key].authRequired)
                .sort(sortFn)
        }

        this.subscribeNext()

        runOnLogin(() => {
            if (!this._subscriptionQueueAuth.length) return
            console.debug('[FirestoreClient] startSync() runOnLogin', this._subscriptionQueueAuth.length)
            const currentQueueLength = this._subscriptionQueue.length
            this._subscriptionQueue.push(...this._subscriptionQueueAuth)
            this._subscriptionQueueAuth = []
            if (!currentQueueLength) this.subscribeNext()
        })
    }

    public async create(resourceName: string, options: any = {}) {
        return (await this.rest(CREATE, resourceName, options)).data
    }
    public async delete(resourceName: string, options: any = {}) {
        return (await this.rest(DELETE, resourceName, options)).data
    }
    public async getMany(resourceName: string, options: any = {}) {
        return (await this.rest(GET_MANY, resourceName, options)).data
    }
    public async getOne(resourceName: string, options: any = {}) {
        return (await this.rest(GET_ONE, resourceName, options)).data
    }
    public async update(resourceName: string, options: any = {}) {
        return (await this.rest(UPDATE, resourceName, options)).data
    }

    public rest = async (method: string, resourceName: string, options: any = {}) => {
        await nextFrame()
        let result: any = { data: [], total: 0, ids: [] }

        const resource = (getState().resources || {})[resourceName]
        // console.log(`[FirestoreClient] callMethod()`, method, resourceName, options, resource, getState())
        if (!resource) return result

        const meta = this._resourcesMeta[resourceName]
        const beforeHooks = meta.hooks.filter((hook) => hook.events.indexOf('BEFORE_' + method) > -1)
        const afterHooks = meta.hooks.filter((hook) => hook.events.indexOf('AFTER_' + method) > -1)

        let { data = {} } = options
        for (const hook of beforeHooks) data = await hook.handler(data)

        const collection = resource.data || {}
        switch (method) {
            case GET_LIST:
            case GET_MANY:
            case GET_MANY_REFERENCE:
                result = await getMany(
                    options,
                    collection,
                )
                break

            case GET_ONE:
                result = getOne(options.id, collection)
                break

            case DELETE:
                result = del(
                    options.id,
                    typeof meta.path === 'function' ? meta.path() : meta.path,
                    meta.schema,
                )
                break

            case UPDATE:
                if (!options.id) {
                    console.warn('[FirestoreClient] _callMethod() No ID provided when calling UPDATE')
                    result = { data }
                    break
                }
            case CREATE:
                const isNew = method === CREATE
                const id = getItemID(
                    options.id || data.id,
                    isNew,
                    typeof meta.path === 'function' ? meta.path() : meta.path,
                    collection,
                )
                data.id = id
                result = await save({
                    id,
                    isNew,
                    next: data,
                    path: typeof meta.path === 'function' ? meta.path() : meta.path,
                    prev: collection[id] || {},
                    schema: meta.schema,
                    timestampFieldNames: this.timestampFieldNames,
                    uploadFn: upload,
                })
                /// Latency compensation for newly created items
                if (isNew) collection[result.data.id] = result.data
                break

            default:
                console.warn('[FirestoreClient] _callMethod() Undocumented method:', method)
        }

        for (const hook of afterHooks) result.data = await hook.handler(result.data || {})
        // console.debug("[FirestoreClient] callMethod()", method, resourceName, result)
        return result
    }

    private _subscribe = (resourceName: string) => {
        const meta = this._resourcesMeta[resourceName]
        if (!meta || meta.unsubscribe) return // do nothing if subscribed already
        // console.debug('[FirestoreClient] _subscribe()', resourceName)

        const db = firestore()
        let syncedOnce = false
        const path = typeof meta.path === 'function' ? meta.path() : meta.path
        const doc = typeof meta.document === 'function' ? meta.document() : meta.document
        meta.ref = db.collection(path)

        /* Apply filters */
        let filters = (typeof meta.filter === 'function' ? meta.filter() : meta.filter) || []
        if (!Array.isArray(filters[0])) filters = [filters]
        filters.forEach((filter: string[3], i: number) => {
            if (!filter.length) return
            console.debug(`[FirestoreClient] _subscribe() Apply filter for ${resourceName}`, filter)
            if (i === filters.length - 1
                && filter.length === 3 && filter[0] === 'id' && filter[1] === '=='
            ) {
                meta.ref = meta.ref.doc(filter[2])
            } else {
                meta.ref = meta.ref.where(...filter)
            }
        })
        if (meta.sortField) {
            const sortField = typeof meta.sortField === 'function' ? meta.sortField() : meta.sortField
            meta.ref = meta.ref.orderBy(sortField, meta.sortDirection || 'asc')
        }
        if (meta.limit) meta.ref = meta.ref.limit(meta.limit)
        if (doc) meta.ref = meta.ref.doc(doc)

        // if (doc) console.debug('[FirestoreClient] _subscribe() Ref', resourceName, meta.ref)
        // if (meta.ref._documentPath) console.debug('[FirestoreClient] _subscribe() Ref', resourceName, meta.ref._documentPath._parts.join('/'))

        let processing = false
        try {
            meta.unsubscribe = meta.ref.onSnapshot(async (snapshot: any) => {
                if (processing) {
                    console.debug('[FirestoreClient] _subscribe() Ignoring', resourceName)
                    return
                }
                processing = true
                if (meta.minSyncInterval) {
                    if (meta.unsubscribe) meta.unsubscribe()
                    meta.unsubscribe = undefined
                    console.debug('[FirestoreClient] _subscribe() Unsubscribed', resourceName)
                    setTimeout(() => this.subscribe(resourceName), meta.minSyncInterval) // TODO: Replace with CRON-like timer (look for the library)
                }

                const count = snapshot.docs ? snapshot.docs.length : (snapshot._data || snapshot._document ? 1 : 0)
                console.debug('[FirestoreClient] _subscribe() Got snapshot', resourceName, count)

                const docs = snapshot.docs ? snapshot.docs : [snapshot]
                const data: any = {}
                await mapInFrames(
                    docs,
                    async (doc: any) => {
                        const { id } = doc || doc._ref
                        data[id] = await this.getData(doc, false, meta.schema)
                        data[id].id = id
                    },
                )

                Actions.resources.updateData({ resource: resourceName, data })
                console.log('[FirestoreClient] _subscribe() Fetched', resourceName, Object.keys(data).length)
                if (!syncedOnce) {
                    const state = getState().resources || {}
                    if (!state.loaded && !this._subscriptionQueue.length) Actions.resources.dataLoaded()
                    syncedOnce = true
                }
                // console.log('[FirestoreClient] _subscribe() Written to Redux', resourceName, getState())

                const hooks = meta.hooks.filter((hook) => hook.events.indexOf('ON_LOAD') > -1)
                for (const hook of hooks) await hook.handler(data)

                processing = false
                if (this._subscriptionQueue.length) this.subscribeNext()
            })
            console.debug(`[FirestoreClient] _subscribe() Subscribed to ${resourceName} (${path}/${doc ? doc : ''})`)
        } catch (e) {
            console.warn('[FirestoreClient] _subscribe() Failed to subscribe', resourceName, e.message)
        }
    }

    // private subscribeNext = () => this.subscribe(this._subscriptionQueue.shift())
    private subscribeNext = () => {
        const next = this._subscriptionQueue.shift()
        // console.debug('[FirestoreClient] subscribeNext()', next, [...this._subscriptionQueue])
        this.subscribe(next)
    }

    private _unsubscribe = (resourceName: string, logout = false) => {
        const meta = this._resourcesMeta[resourceName]
        if (!meta.unsubscribe) return // do nothing if not subscribed

        meta.unsubscribe()
        meta.unsubscribe = undefined
        if (logout) {
            // Actions.resources.updateData({resource: resourceName, data: {}})
            this._subscriptionQueueAuth.push(resourceName)
        }
    }

    private subscribe = (resourceName: string | undefined) => {
        if (!resourceName) return

        const meta = this._resourcesMeta[resourceName]
        if (!meta || meta.unsubscribe) return
        // console.debug('[FirestoreClient] subscribe()', resourceName)

        const subscribeAsync = () => runAsync(() => this._subscribe(resourceName))
        if (!meta.authRequired) {
            subscribeAsync()
            return
        }
        if (getUserId()) {
            subscribeAsync()
        } else {
            this._subscriptionQueueAuth.push(resourceName)
            this.subscribeNext()
            console.debug(`[FirestoreClient] subscribe() Subscription for "${resourceName}" queued`)
        }

        runOnRolesChange(async () => {
            console.log('[FirestoreClient] runOnRolesChange()', resourceName)
            this._unsubscribe(resourceName)
            subscribeAsync()
            // this._subscriptionQueueAuth.push(resourceName)
            // this._subscriptionQueue.push(resourceName)
            // this._subscriptionQueueAuth = []
            // this.subscribeNext()
        })
        runOnLogout(() => {
            console.debug('[FirestoreClient] subscribe() runOnLogout', resourceName)
            this._unsubscribe(resourceName, true)
        })
    }

    private async getData(doc: any, isRef: boolean = false, schema: any = {}) {
        let result: any = {}
        try {
            if (isRef) {
                const path = _documentPath(doc)

                //* Find object within the fetched data, fetch if not found */
                const state = getState()
                const obj = R.path<any>(`${path[0]}.data.${path.slice(1).join('.')}`, state.resources)
                if (!obj) {
                    // await nextFrame()
                    const innerDoc = await doc.get()
                    // TODO: Consider subscription to the item here
                    result = await this.getData(innerDoc, false, schema)
                } else {
                    result = obj
                }

                result.__ref = path.join('/')
            } else if (doc.exists) {
                result = doc.data()
                delete result.__ref
                for (const key of Object.keys(result)) {
                    if (_documentPath(result[key])) {
                        // await nextFrame()
                        if (!schema._ignoreReferences) {
                            result[key] = await this.getData(result[key], true, schema)
                        } else {
                            delete result[key]
                        }
                    } else {
                        if (result[key] instanceof Date) {
                            result[key] = result[key].toISOString()
                        }
                        // TODO: Consider converting in opposite direction (String -> Date), use this.timestampFieldNames
                    }
                }
            }
        } catch (e) {
            console.warn('[FirestoreClient] getData()', _documentPath(doc._ref || doc).join('/'), e.message, isRef)
        }

        /* Deep clean from nulls as they are not recognized correctly when setting default values for props */
        return deepClone(result, [], [null])
    }
}

function _documentPath(doc: any) {
    if (!doc) return
    if (doc._documentPath) return doc._documentPath._parts
    if (doc._key && doc._key.path && doc._key.path.segments) return doc._key.path.segments.slice(5)
}
