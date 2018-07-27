import {getUserId} from './client'


export function checkAuthAndRun(success: Function, fail: Function) {
    if(typeof success !== 'function') return
    if(getUserId()) {
        success()
        return
    }
    window.alert('This function requires you to be authorized. Please sign in to proceed.')
}
