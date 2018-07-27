import firebase from 'firebase/app'
import 'firebase/auth'
import 'firebase/firestore'
import 'firebase/storage'

export {
    firebase,
}

export const fileToBase64 = (file: any): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string || '')
    reader.onerror = reject
})

export function fileToBase64Helper(rawFile: any, uri: string, url: string) {
    return fileToBase64(rawFile ? rawFile : url)
}
