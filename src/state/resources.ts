import {
    State,
    IReduce,
} from 'jumpstate'


type Resource = {
    data: any
    loaded: boolean
    version: number
}
export interface IResourcesState {
    loaded: boolean
    [R: string]: Resource | any
}
export type IResourcesActions = {
    dataLoaded(): IReduce<IResourcesState>
    updateData(payload: any): IReduce<IResourcesState>
}

export const Resources = State('resources', {
    initial: {
        loaded: false,
    } as IResourcesState,
    dataLoaded: (state: IResourcesState) => ({
        ...state,
        loaded: true,
    }),
    updateData: (state: IResourcesState, payload: any) => ({
        ...state,
        [payload.resource]: {
            data: payload.data,
            loaded: true,
            version: ((state[payload.resource] || {}).version || 0) + 1,
        },
    }),
})
