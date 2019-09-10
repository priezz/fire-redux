import { fileToBase64 } from './index.ios'


export * from './index.ios'

export function fileToBase64Helper(rawFile: any, uri: string, url: string) {
    return fileToBase64(rawFile ? rawFile : url)
}

export const PLATFORM = 'android'
