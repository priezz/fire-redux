import {AuthCredential} from '@firebase/auth-types'

import {
    AUTH_CHECK,
    AUTH_GET_PERMISSIONS,
    AUTH_LOGIN,
    AUTH_LOGIN_ANONYMOUS,
    AUTH_LOGOUT,
} from '../constants'
import {firebase} from '../platformic'
import {
    objectsEqual,
    runAsync,
} from '../routines'
import {
    Actions,
    getState,
} from '../state'


let _actualRoles: any
let _passedAuth = false
const _runOnLoginQueue: any[] = []
const _runOnceOnLoginQueue: any[] = []
const _runOnLogoutQueue: any[] = []
const _runOnceOnLogoutQueue: any[] = []
const _runOnRolesChangeQueue: any[] = []


async function authClient(type: string, params?: any) {
    // console.debug('authClient', type)
    switch(type) {
        case AUTH_LOGOUT:
            // if(!_passedAuth) return /// do not sign out on app load
            processLogoutQueues()
            Actions.auth.logout()
            try {
                if(getUserId()) firebase.auth().signOut()
                return true
            } catch(e) {
                console.warn('Firebase/authClient() Logout error.', e.message)
                return false
            }

        case AUTH_CHECK:
            return new Promise((resolve, reject) => {
                const checker = () => {
                    if(getUserId()) {
                        _passedAuth = true
                        // console.log('Added auth check resolve to queue')
                        runOnLogin(resolve)
                    } else {
                        reject(new Error())
                    }
                }
                /// firebase.auth() data is not available immediately on the App start
                if(_passedAuth) checker()
                else setTimeout(checker, 900)
            })

        case AUTH_LOGIN:
            return new Promise(async (resolve, reject) => firebaseAuth(params, resolve, reject))

        case AUTH_LOGIN_ANONYMOUS:
            console.log('AUTH_LOGIN_ANONYMOUS, UID:', getUserId())
            if(getUserId()) return true
            const {user} = await firebase.auth().signInAnonymously()
            if(user && user.uid) {
                // console.log('Logged in, UID:', user.uid)
                // processLoginQueues()
                return true
            } else {
                console.warn('Failed to log in anonymously')
                return false
            }

        case AUTH_GET_PERMISSIONS:
            return new Promise((resolve) => runOnceOnLogin(() => resolve(userHasRole)))

        default:
            return false
    }
}
export default authClient

interface Credentials extends AuthCredential {
    username: string,
    password: string,
    token: string,
    expiresAt: string,
    userId?: string,
    email: string,
    phone: string,
}

async function firebaseAuth(credentials: Credentials, resolve: any, reject: any) {
    try {
        // console.log('Firebase/firebaseAuth() Params', credentials)
        const {username, password, token, userId} = credentials
        const {user, additionalUserInfo} = token
            ? token
                ? await firebase.auth().signInAndRetrieveDataWithCustomToken(token)
                : await firebase.auth().signInAndRetrieveDataWithCredential(credentials)
            : await firebase.auth().signInAndRetrieveDataWithEmailAndPassword(username, password)
        if(!user || (credentials.userId && user.uid !== credentials.userId)) {
            return reject(new Error('Login failed!'))
        }
        console.debug('Firebase/firebaseAuth() Result', user, additionalUserInfo)
        if(userId && user.uid !== userId) return reject(new Error('Login failed!'))

        const idToken = await user.getIdToken()
        Actions.auth.login({userId, idToken})

        processLoginQueues()

        resolve()
    } catch(e) {
        console.warn('Firebase/firebaseAuth() auth error', credentials, e.message)
        reject(e)
    }
}

export const getUserId = () => {
    const {userId} = getState().auth
    return userId
}
export const getUserRoles = () => _actualRoles
export const userHasRole = (role: string): boolean => !!(_actualRoles || {})[role.toLowerCase()]

export const login = (params: any) => authClient(AUTH_LOGIN, params)
export const logout = () => authClient(AUTH_LOGOUT)

export function runOnLogin(f: () => void) {
    /* Execute only after user's roles are fetched */
    if(getUserId()) runAsync(f)
    _runOnLoginQueue.push(f)
}
export function runOnceOnLogin(f: () => void) {
    /* Execute only after user's roles are fetched */
    if(getUserId()) runAsync(f)
    else _runOnceOnLoginQueue.push(f)
}
export function processLoginQueues() {
    console.log('processLoginQueues()', _runOnceOnLoginQueue.length, _runOnLoginQueue.length)
    while(_runOnceOnLoginQueue.length) runAsync(_runOnceOnLoginQueue.pop())
    for(const f of _runOnLoginQueue) runAsync(f)
}

export const runOnLogout = (f: () => void) => _runOnLogoutQueue.push(f)
export const runOnRolesChange = (f: () => void) => _runOnRolesChangeQueue.push(f)
export const runOnceOnLogout = (f: () => void) => _runOnceOnLogoutQueue.push(f)
export function processLogoutQueues() {
    while(_runOnceOnLogoutQueue.length) runAsync(_runOnceOnLogoutQueue.pop())
    for(const f of _runOnLogoutQueue) runAsync(f)
}


/* Track user's login/logout and roles changes */

async function _getUserRoles(doc: any) {
    const justLoggedIn = typeof _actualRoles === 'undefined'

    const roles = doc.exists ? doc.data() : {}
    if(roles.createdAt) delete roles.createdAt
    if(roles.id) delete roles.id
    if(roles.updatedAt) delete roles.updatedAt

    if(objectsEqual(_actualRoles, roles)) return
    _actualRoles = roles

    if(!justLoggedIn) _runOnRolesChangeQueue.forEach((f: Function) => runAsync(f))
    console.log('Auth/ Got user roles:', _actualRoles)
}

function startAuthStateTracking() {
    // console.log('startAuthStateTracking()')
    function rolesRef(uid: string) {
        return firebase.firestore().collection('users').doc(uid).collection('roles').doc(uid)
    }

    runOnLogin(async () => {
        const uid = getUserId()
        if(!uid) return

        const _userUnsubscribe = rolesRef(uid).onSnapshot(_getUserRoles)
        runOnLogout(() => {
            _actualRoles = undefined
            _userUnsubscribe
        })
    })

    firebase.auth().onAuthStateChanged(async (user: any) => {
        // console.log('onAuthStateChanged()', user)
        if(!user) return
        const uid = user.uid || (user._user || {}).uid
        if(!uid) return

        console.log('onAuthStateChanged() Got UID', uid)
        try {
            Actions.auth.updateToken({idToken: await user.getIdToken(), userId: uid})
            await _getUserRoles(await rolesRef(uid).get())
            processLoginQueues()
        } catch(e) {
            console.warn('onAuthStateChanged() Failed to get token for', uid, user._user)
        }
    })
}

function _initAuthStateTracking() {
    const state = getState()
    if(firebase && state && state.auth) startAuthStateTracking()
    else setTimeout(_initAuthStateTracking, 300)
}
_initAuthStateTracking()
