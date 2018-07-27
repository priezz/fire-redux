import {
    AppState,
    InteractionManager,
} from 'react-native'


export async function nextFrame(f: () => any = () => { }) {
    if (AppState.currentState !== 'active') return await f()
    await Promise.all([
        new Promise((resolve) => requestAnimationFrame(resolve)),
        new Promise((resolve) => InteractionManager.runAfterInteractions(resolve)),
    ])
    return await f()
}


export async function mapInFrames(array: any[], fn: any) {
    if (!Array.isArray(array)) return []
    if (typeof fn !== 'function') return array
    const _fn = AppState.currentState === 'active'
        ? (item: any, i: number) => new Promise((resolve) => {
            nextFrame(async () => setTimeout(resolve, 0, await fn(item, i)))
        })
        : (item: any, i: number) => fn(item, i)
    const result: any[] = new Array(array.length)
    await Promise.all(array.map(async (item: any, i: number) => result[i] = await _fn(item, i)))
    return result
}
