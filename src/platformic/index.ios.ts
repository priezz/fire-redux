// import * as base64 from 'base64-js'
import * as FileSystem from 'react-native-fs'
import firebase from '@react-native-firebase/app'
import auth from '@react-native-firebase/auth'
import firestore from '@react-native-firebase/firestore'
import storage from '@react-native-firebase/storage'


// firestore().settings({
//     timestampsInSnapshots: false,
// })
export { auth, firebase, firestore, storage }

// function stringToUint8Array(str: string) {
//     const length = str.length
//     const array = new Uint8Array(new ArrayBuffer(length))
//     for (let i = 0; i < length; i++) array[i] = str.charCodeAt(i)
//     return array
// }

export async function fileToBase64(uri: string) {
    try {
        return await FileSystem.readFile(uri, 'base64')
        // const content = await FileSystem.readFile(uri)
        // return base64.fromByteArray(stringToUint8Array(content))
    } catch (e) {
        console.warn('FirebaseStorage/fileToBase64()', e.message)
        return ''
    }
}

/* Accepts 'rawFile' file object or the data 'uri' */
export function fileToBase64Helper(rawFile: any, uri: string, url: string) {
    return fileToBase64(rawFile ? rawFile : uri)
}

export const getPutFileFn = () => storage().ref().putFile

export const PLATFORM = 'ios'
