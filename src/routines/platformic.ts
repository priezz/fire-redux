
export async function nextFrame(f: () => any = () => {}) {
    await (new Promise((resolve) => requestAnimationFrame(resolve)))
    return await f()
}


export async function mapInFrames(array: any[], fn: any) {
    if(!Array.isArray(array)) return []
    if(typeof fn !== 'function') return array
    const _fn = (item: any, i: number) => new Promise((resolve) => {
        nextFrame(async () => setTimeout(resolve, 0, await fn(item, i)))
    })
    const result: any[] = new Array(array.length)
    await Promise.all(array.map(async (item: any, i: number) => result[i] = await _fn(item, i)))
    return result
}
