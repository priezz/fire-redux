import {
    // Effect,
    State,
    IReduce,
} from 'jumpstate'

export interface Roles {
    [key: string]: boolean
}

export interface IAuthState {
    idToken?: string | undefined
    roles: Roles
    userId?: string | undefined
}
export type IAuthActions = {
    login(payload: any): IReduce<IAuthState>
    logout(): IReduce<IAuthState>
    updateRoles(roles: Roles): IReduce<IAuthState>
    updateToken({ idToken, userId }: { idToken: string, userId?: string }): IReduce<IAuthState>
}

export const initialState: IAuthState = {
    roles: {},
}

export const Auth = State('auth', {
    initial: initialState,
    login: (state: IAuthState, payload: any) => ({
        ...state,
        idToken: payload.idToken,
        userId: payload.userId,
    }),
    logout: (state: IAuthState) => ({
        ...state,
        userId: undefined,
        idToken: undefined,
    }),
    updateRoles: (state: IAuthState, roles: Roles) => {
        return {
            ...state,
            roles,
        }
    },
    updateToken: (state: IAuthState, { idToken, userId }: { idToken: string, userId?: string }) => {
        return idToken === state.idToken
            ? state
            : {
                ...state,
                idToken,
                ...(userId ? { userId } : {}),
            }
    },
})
