import {Alert} from 'react-native'

import {getUserId} from './client'


export function checkAuthAndRun(success: Function, fail: Function) {
    if(typeof success !== 'function') return
    if(getUserId()) {
        success()
        return
    }
    Alert.alert(
        '',
        'This function requires you to be signed in. Do you want to proceed with SIGN IN?',
        [{
            text: "Later",
        }, {
            text: "Proceed",
            onPress: () => fail(),
        }],
    )
}
