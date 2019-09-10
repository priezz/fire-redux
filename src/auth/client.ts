import { AuthCredential } from '@firebase/auth-types'

import {
    AUTH_CHECK,
    AUTH_GET_PERMISSIONS,
    AUTH_LOGIN,
    AUTH_LOGIN_ANONYMOUS,
    AUTH_LOGOUT,
} from '../constants'
import { auth, firestore } from '../platformic'
import {
    objectsEqual,
    runAsync,
} from '../routines'
import {
    Actions,
    getState,
} from '../state'


let _passedAuth = false
const _runOnLoginQueue: any[] = []
let _runOnceOnLoginQueue: any[] = []
const _runOnLogoutQueue: any[] = []
let _runOnceOnLogoutQueue: any[] = []
const _runOnRolesChangeQueue: any[] = []


async function authClient(type: string, params?: any) {
    // console.debug('authClient', type)
    switch (type) {
        case AUTH_LOGOUT:
            // if(!_passedAuth) return /// do not sign out on app load
            processLogoutQueues()
            Actions.auth.logout()
            try {
                if (getUserId()) auth().signOut()
                return true
            } catch (e) {
                console.warn('Firebase/authClient() Logout error.', e.message)
                return false
            }

        case AUTH_CHECK:
            return new Promise((resolve, reject) => {
                const checker = () => {
                    if (getUserId()) {
                        _passedAuth = true
                        // console.log('Added auth check resolve to queue')
                        runOnLogin(resolve)
                    } else {
                        reject(new Error())
                    }
                }
                /// auth() data is not available immediately on the App start
                if (_passedAuth) checker()
                else setTimeout(checker, 900)
            })

        case AUTH_LOGIN:
            return new Promise(async (resolve, reject) => firebaseAuth(params, resolve, reject))

        case AUTH_LOGIN_ANONYMOUS:
            console.log('AUTH_LOGIN_ANONYMOUS, UID:', getUserId())
            if (getUserId()) return true
            const { user } = await auth().signInAnonymously()
            if (user && user.uid) {
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
        const { username, password, token, userId } = credentials
        const { user, additionalUserInfo } = token
            ? token
                ? await auth().signInWithCustomToken(token)
                : await auth().signInWithCredential(credentials)
            : await auth().signInWithEmailAndPassword(username, password)
        if (!user || (credentials.userId && user.uid !== credentials.userId)) {
            return reject(new Error('Login failed!'))
        }
        console.debug('Firebase/firebaseAuth() Result', user, additionalUserInfo)
        if (userId && user.uid !== userId) return reject(new Error('Login failed!'))

        const idToken = await user.getIdToken()
        Actions.auth.login({ userId, idToken })

        processLoginQueues()

        resolve()
    } catch (e) {
        console.warn('Firebase/firebaseAuth() auth error', credentials, e.message)
        reject(e)
    }
}

export const getUserId = () => getState().auth.userId
export const getUserRoles = () => getState().auth.roles
export const userHasRole = (role: string): boolean => !!getUserRoles()[role.toLowerCase()]

export const login = (params: any) => authClient(AUTH_LOGIN, params)
export const logout = () => authClient(AUTH_LOGOUT)

export function runOnLogin(f: () => void, priority = 99) {
    if (typeof f !== 'function') return
    /* Execute only after user's roles are fetched */
    if (getUserId()) runAsync(f)
    if (!_runOnLoginQueue[priority]) _runOnLoginQueue[priority] = []
    _runOnLoginQueue[priority].push(f)
}
export function runOnceOnLogin(f: () => void) {
    if (typeof f !== 'function') return
    /* Execute only after user's roles are fetched */
    if (getUserId()) runAsync(f)
    else _runOnceOnLoginQueue.push(f)
}
export function runOnLogout(f: () => void) {
    if (typeof f !== 'function') return
    _runOnLogoutQueue.push(f)
}
export function runOnRolesChange(f: () => void) {
    if (typeof f !== 'function') return
    _runOnRolesChangeQueue.push(f)
}
export function runOnceOnLogout(f: () => void) {
    if (typeof f !== 'function') return
    _runOnceOnLogoutQueue.push(f)
}

export async function processLoginQueues() {
    // console.debug('processLoginQueues() Once', _runOnceOnLoginQueue.length)
    await Promise.all(_runOnceOnLoginQueue)
    _runOnceOnLoginQueue = []
    for (const i in _runOnLoginQueue) {
        // console.debug('processLoginQueues() Regular', i, _runOnLoginQueue[i].length, _runOnLoginQueue[i])
        await Promise.all(_runOnLoginQueue[i].map((f: Function) => f()))
        // console.debug('processLoginQueues() Regular', i, 'finished.')
    }
}
export async function processLogoutQueues() {
    await Promise.all(_runOnceOnLogoutQueue)
    _runOnceOnLogoutQueue = []
    for (const f of _runOnLogoutQueue) runAsync(f)
}


/* Track user's login/logout and roles changes */

function _getUserRoles(doc: any, source?: string) {
    const { roles: prevRoles } = getState().auth
    const justLoggedIn = !Object.keys(prevRoles).length

    const roles = doc.exists ? doc.data() : {}
    // TODO: Allow custom create and update timestamp fields
    if (roles.createdAt) delete roles.createdAt
    if (roles.id) delete roles.id
    if (roles.updatedAt) delete roles.updatedAt

    // console.log('[Auth] Got user roles.', { roles, prevRoles, justLoggedIn, source: source || 'onSnapshot' })
    if (objectsEqual(prevRoles, roles)) return
    Actions.auth.updateRoles(roles)

    if (!justLoggedIn) _runOnRolesChangeQueue.forEach((f: Function) => runAsync(f))
    console.log('[Auth] Got user roles:', roles)
}

function startAuthStateTracking() {
    // console.log('startAuthStateTracking()')
    function rolesRef(uid: string) {
        return firestore().collection('users').doc(uid).collection('roles').doc(uid)
    }

    runOnLogin(() => new Promise((resolve) => {
        const uid = getUserId()
        if (!uid) return resolve()

        const _userUnsubscribe = rolesRef(uid).onSnapshot((doc: any) => {
            _getUserRoles(doc)
            resolve()
        })
        runOnLogout(() => {
            Actions.auth.updateRoles({})
            _userUnsubscribe()
        })
    }), 0)

    auth().onAuthStateChanged(async (user: any) => {
        // console.log('[Auth] onAuthStateChanged()', user)
        if (!user) return
        const uid = user.uid || (user._user || {}).uid
        if (!uid) return

        console.log('[Auth] onAuthStateChanged() Got UID', uid)
        try {
            _getUserRoles(await rolesRef(uid).get(), 'onAuthStateChanged')
            Actions.auth.updateToken({ idToken: await user.getIdToken(), userId: uid })
            processLoginQueues()
        } catch (e) {
            console.warn('[Auth] onAuthStateChanged() Failed to get token for', uid, user._user)
        }
    })
}

function _initAuthStateTracking() {
    const state = getState()
    if (auth && state && state.auth) startAuthStateTracking()
    else setTimeout(_initAuthStateTracking, 300)
}
_initAuthStateTracking()
