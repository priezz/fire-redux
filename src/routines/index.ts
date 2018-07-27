import * as R from 'rambda'


export * from './platformic'


export async function runAsync(f: any) {
    if(typeof f === 'function') {
        // await nextFrame()
        return f()
    }
}


export function deepObjectsDiff(
    prev: any = {},
    next: any = {},
    levelResetField: string,
    level: number = 0,
) {
    if(typeof prev === 'undefined' || prev === null) {
        return {
            diff: next,
            different: true,
        }
    }

    const keys = R.uniq([...Object.keys(prev || {}), ...Object.keys(next)])
    const logicalLevel = keys.indexOf(levelResetField) > -1 ? 0 : level
    const isArray = Array.isArray(next)
    const diff: any = isArray ? [] : {}
    let different = false
    keys.forEach((key: string) => {
        let p = prev[key]
        let n = next[key]
        if(p instanceof Date) p = p.toISOString()
        if(n instanceof Date) n = n.toISOString()
        const nIsObject = typeof n === 'object' && n !== null
        const specialField = key === levelResetField
        let value: any
        let keyValueIsDifferent = false
        if((!nIsObject && p !== n) || (specialField && (!p || !n))) {
            keyValueIsDifferent = true
            different = true
            value = n
        }
        if(specialField) value = n
        if(nIsObject && !specialField) {
            const result = deepObjectsDiff(p, n, levelResetField, logicalLevel + 1)
            if(result.different) {
                keyValueIsDifferent = true
                different = true
                value = result.diff
            }
        }
        // if(typeof value !== 'undefined' && value !== null) {
        if(keyValueIsDifferent) {
            if(value === undefined) value = null
            if(isArray) diff.push(value)
            else diff[key] = value
        }
    })
    return {
        diff: different && (logicalLevel === 0 ? diff : next),
        different,
    }
}


export function deepClone(obj: any, excludeFields: string[] = [], excludeValues: any[] = []) {
    const isArray = Array.isArray(obj)
    const result: any = isArray ? [] : {}
    Object.keys(obj).forEach((key: string) => {
        if(excludeFields.indexOf(key) > -1) return
        const item = obj[key]
        const isObj = typeof item === 'object' && item !== null
        if(!isObj && excludeValues.indexOf(item) > -1) return
        const value = isObj ? deepClone(item, excludeFields, excludeValues) : item
        if(isArray) result.push(value)
        else result[key] = value
    })
    return result
}


export function deepObjectToStringArray(obj: any, excludeFields: string[] = []) {
    const result: any[] = []
    Object.keys(obj).forEach((key: string) => {
        if(excludeFields.indexOf(key) > -1) return
        const item = obj[key]
        const isObj = typeof item === 'object' && item !== null
        const value = isObj ? deepObjectToStringArray(item, excludeFields) : item
        if((isObj && value.length) || typeof value === 'string') result.push(value)
    })
    return result
}


export function objectsEqual(...objects: any[]) {
    let leftChain: any[] = []
    let rightChain: any[] = []

    const _compare2Objects = (x: any, y: any) => {
        // Remember that NaN === NaN returns false and isNaN(undefined) returns true
        if(isNaN(x) && isNaN(y) && typeof x === 'number' && typeof y === 'number') return true
        // Compare primitives and functions. Check if both arguments link to the same object.
        if(x === y) return true
        // Works in case when functions are created in constructor.
        // Comparing dates is a common scenario.
        // We can even handle functions passed across iframes
        if((typeof x === 'function' && typeof y === 'function') ||
            (x instanceof Date && y instanceof Date) ||
            (x instanceof RegExp && y instanceof RegExp) ||
            (x instanceof String && y instanceof String) ||
            (x instanceof Number && y instanceof Number)) {
            return x.toString() === y.toString()
        }
        // At last checking prototypes as good as we can
        if(!(x instanceof Object && y instanceof Object)) return false
        if(x.isPrototypeOf(y) || y.isPrototypeOf(x)) return false
        if(x.constructor !== y.constructor) return false
        if(x.prototype !== y.prototype) return false
        // Check for infinitive linking loops
        if(leftChain.indexOf(x) > -1 || rightChain.indexOf(y) > -1) return false
        // Quick checking of one object being a subset of another.
        // todo: cache the structure of arguments[0] for performance
        for(const p in y) {
            if(y.hasOwnProperty(p) !== x.hasOwnProperty(p)) return false
            else if(typeof y[p] !== typeof x[p]) return false
        }
        for(const p in x) {
            if(y.hasOwnProperty(p) !== x.hasOwnProperty(p)) return false
            else if(typeof y[p] !== typeof x[p]) return false
            switch(typeof (x[p])) {
                case 'object':
                case 'function':
                    leftChain.push(x)
                    rightChain.push(y)
                    if(!_compare2Objects(x[p], y[p])) return false
                    leftChain.pop()
                    rightChain.pop()
                    break
                default:
                    if(x[p] !== y[p]) return false
                    break
            }
        }
        return true
    }

    const length = objects.length
    if(length < 1) return true

    for(let i = 1; i < length; i++) {
        leftChain = []
        rightChain = []
        if(!_compare2Objects(objects[0], objects[i])) return false
    }
    return true
}
