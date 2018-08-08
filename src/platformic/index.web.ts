import _firebase from '@firebase/app'
import '@firebase/auth'
import '@firebase/firestore'
import '@firebase/storage'

export const firebase: any = _firebase

export const fileToBase64 = (file: any): Promise<string> => new Promise((resolve, reject) => {
    // console.debug('FirebaseStorage/fileToBase64()', file)

    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
})

export function fileToBase64Helper(rawFile: any, uri: string, url: string) {
    return fileToBase64(rawFile ? rawFile : url)
}
