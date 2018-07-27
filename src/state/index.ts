import {
    Actions as _Actions,
    // getState as _getState,
} from 'jumpstate'

import {Resources, IResourcesActions, IResourcesState} from './resources'
import {Auth, IAuthActions, IAuthState} from './auth'


export interface IFirebaseActions {
    resources: IResourcesActions
    auth: IAuthActions
}
export const Actions: IFirebaseActions = _Actions

export interface IFirebaseState {
    auth: IAuthState
    resources: IResourcesState
}


const defaultState: IFirebaseState = {
    // TODO: Get default values from .initial
    auth: {},
    resources: {
        loaded: false,
    },
}

let _store: any
export let getState: () => IFirebaseState = () => defaultState
// export let getState: () => IFirebaseState = _getState
export function setFirebaseStore(store: any) {
    _store = store
    if(_store && typeof _store.getState === 'function') getState = _store.getState
    // if(_store && typeof _store.getState === 'function') console.log('setFirebaseStore() Setting getState', _store, getState())
}

export const reducers = {
    auth: Auth,
    resources: Resources,
}
