import crc32 from './crc32'
import {
    fileToBase64Helper,
    firebase,
} from './platformic'


export async function uploadSingleFile(f: any, writePath: string, existingMedia?: any[]) {
    const { base64: _base64, ext: _ext, rawFile, type, url } = f
    if (!url && !rawFile) return {}

    // Workaround against strangely formed cache path by Expo on Android
    const uri = unescape(url || '')

    let base64 = _base64
    let base64Header
    if (!base64) {
        const result = (url.startsWith('data:') ? url : (await fileToBase64Helper(rawFile, uri, url)))
            .split('base64,')
        base64 = result[result.length - 1]
        base64Header = result[result.length - 2]
    }
    if (!base64) return {}

    const crc = crc32(base64)
    const ext = _ext || (rawFile ? rawFile.name : uri).split('.').slice(-1)[0]
    const contentType = base64Header
        ? base64Header.replace(/data:(.+);/g, '$1')
        : `${type || 'image'}/${ext}`.replace('jpg', 'jpeg') // TODO: Detect type by ext

    const ref = firebase.storage().ref(`${writePath}/${crc}/origin.${ext}`)
    console.debug('FirebaseStorage/uploadSingleFile() Meta:', { ext, crc, contentType, ref, url, uri })

    /* Check if same file is already in the list */
    if (existingMedia && existingMedia.findIndex((m: any) => m.originCrc32 === crc) !== -1) {
        // console.debug('FirebaseStorage/uploadSingleFile() This image is already in the list', crc)
        return undefined
    }
    /* Do not re-upload file if it is already uploaded */
    let externalUrl
    const extraFields: any = {}
    // console.debug('FirebaseStorage/uploadSingleFile() Checking if file already uploaded', crc, url)
    try {
        externalUrl = await ref.getDownloadURL()
        // console.debug('FirebaseStorage/uploadSingleFile() Download url exists', externalUrl)
    } catch (e) {
        const metadata = {
            contentType,
            ext,
            name: rawFile ? rawFile.name : crc + '.' + ext,
        }
        // console.debug('FirebaseStorage/uploadSingleFile() Preparing for upload', crc, uri)
        try {
            /// putString() not supported yet
            // const snapshot = base64
            //     ? await ref.putString(base64, 'base64', metadata)
            //     : await ref.put(uri, metadata)
            const snapshot = await ref.put(rawFile ? rawFile : uri, metadata)
            if (snapshot.state !== 'success') throw new Error('Failed to upload')
            const { bucket, fullPath } = snapshot.metadata
            externalUrl = snapshot.downloadURL
                || `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(fullPath)}`
            extraFields.createdAt = Date.now()
        } catch (e) {
            console.warn('FirebaseStorage/uploadSingleFile()', e, crc, uri)
            return {}
        }
    }

    return {
        contentType,
        ...extraFields,
        name: rawFile ? rawFile.name : crc + '.' + ext,
        originCrc32: crc,
        url: externalUrl.split('?').shift() + '?alt=media',
    }
}

export async function uploadAttachments(
    id: string,
    media: any[] = [],
    uploadPath: (id: string) => string | string,
) {
    if (!media.length) return []
    // console.debug('FirebaseStorage/uploadAttachments()', id, media)

    /* Only freshly dropped media are instance of File */
    // const newPredicate = (m: any) => m.url
    //     && ((m.url.startsWith('file:///') && m.base64) || (m.url.startsWith('blob:') || m.url.startsWith('data:')))
    const newPredicate = (m: any) => !m.url || !m.url.startsWith('http')
    const existingMedia = media.filter((m: any) => !newPredicate(m))
    const newMedia = media.filter(newPredicate)
    if (!newMedia.length) return existingMedia

    const path = typeof uploadPath === 'function' ? uploadPath(id) : uploadPath
    const transformedMedia = await Promise.all(newMedia.map(
        async (file: any) => uploadSingleFile(file, path, existingMedia),
    ))
    console.log(`FirebaseStorage/uploadAttachments() ${transformedMedia.length} file objects transformed`)
    /* Merge previous and new media, cleanup the result from empty records */
    return [...existingMedia, ...transformedMedia.filter((m: any) => !!m)]
}
