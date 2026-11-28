// Native Recorder has one foreground JS owner. Web coordinates browser tabs.
export async function retainResultOwner(_key: string) {}
export async function assertResultOwnerAvailable(_key: string) {}
export function releaseResultOwner(_key: string) {}
