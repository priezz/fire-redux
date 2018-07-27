import {
    // Effect,
    State,
    IReduce,
} from 'jumpstate'


export interface IAuthState {
    userId?: string | undefined
    idToken?: string | undefined
}
export type IAuthActions = {
    login(payload: any): IReduce<IAuthState>
    logout(): IReduce<IAuthState>
    updateToken({idToken, userId}: {idToken: string, userId?: string}): IReduce<IAuthState>
}

export const Auth = State('auth', {
    initial: {},
    login: (state: IAuthState, payload: any) => ({
        ...state,
        userId: payload.userId,
        idToken: payload.idToken,
    }),
    updateToken: (state: IAuthState, {idToken, userId}: {idToken: string, userId?: string}) => {
        return idToken === state.idToken
            ? state
            : {
                ...state,
                idToken,
                ...(userId ? {userId} : {}),
            }
    },
    logout: (state: IAuthState) => ({
        ...state,
        userId: undefined,
        idToken: undefined,
    }),
})
