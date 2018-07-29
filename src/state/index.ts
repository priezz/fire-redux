import {
    Actions as _Actions,
    // getState as _getState,
} from 'jumpstate'

import {
    Resources,
    IResourcesActions,
    IResourcesState,
    initialState as initialResoucesState,
} from './resources'
import {
    Auth,
    IAuthActions,
    IAuthState,
    initialState as initialAuthState,
} from './auth'


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
    auth: initialAuthState,
    resources: initialResoucesState,
}

let _store: any
export let getState: () => IFirebaseState = () => defaultState
// export let getState: () => IFirebaseState = _getState
export function setFirebaseStore(store: any) {
    _store = store
    if (_store && typeof _store.getState === 'function') getState = _store.getState
    // if(_store && typeof _store.getState === 'function') console.log('setFirebaseStore() Setting getState', _store, getState())
}

export const reducers = {
    auth: Auth,
    resources: Resources,
}
