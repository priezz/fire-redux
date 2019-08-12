// import firebase from '@firebase/app'
// import auth from '@firebase/auth'
// import firestore from '@firebase/firestore'
// import storage from '@firebase/storage'

// export { auth, firebase, firestore, storage }

import firebase from '@firebase/app'
import '@firebase/auth'
import '@firebase/firestore'
import '@firebase/storage'
import * as types from '@firebase/firestore-types'
import { FirebaseApp } from '@firebase/app-types'
// import { FirebaseAuth } from '@firebase/auth-types'
// import { FirebaseFirestore } from '@firebase/firestore-types'
// import { FirebaseStorage } from '@firebase/storage-types'

export { firebase }
export const auth = firebase.auth!
export const firestore: {
    (app?: FirebaseApp): types.FirebaseFirestore;
    Blob: typeof types.Blob;
    CollectionReference: typeof types.CollectionReference;
    DocumentReference: typeof types.DocumentReference;
    DocumentSnapshot: typeof types.DocumentSnapshot;
    FieldPath: typeof types.FieldPath;
    FieldValue: typeof types.FieldValue;
    Firestore: typeof types.FirebaseFirestore;
    GeoPoint: typeof types.GeoPoint;
    Query: typeof types.Query;
    QuerySnapshot: typeof types.QuerySnapshot;
    Timestamp: typeof types.Timestamp;
    Transaction: typeof types.Transaction;
    WriteBatch: typeof types.WriteBatch;
    setLogLevel: typeof types.setLogLevel;
} = firebase.firestore!
export const storage = firebase.storage!

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
