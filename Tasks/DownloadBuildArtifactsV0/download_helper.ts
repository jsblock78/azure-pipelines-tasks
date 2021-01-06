import { debug as writeDebugInfo, loc as mapLocString } from 'azure-pipelines-task-lib/task';
import { ArtifactDownloadTicket, ItemType, TicketState } from 'artifact-engine/Models';
import { getFileSizeInBytes } from './file_helper';

/**
 * Just a Promise wrapper for setTimeout function
 * @param {number} interval - timeout interval in milliseconds
 */
export function timeoutPromise(interval: number): Promise<{}> {
    writeDebugInfo(`Wait for ${interval} milliseconds`);
    return new Promise(resolve => setTimeout(resolve, interval));
}

/**
 * This function checks a result of artifact download
 * @param  {Array<ArtifactDownloadTicket>} downloadTickets
 * @throws Exception if downloaded build artifact is not healthy
 * @returns void
 */
export function handlerCheckDownloadedFiles(downloadTickets: Array<ArtifactDownloadTicket>): void {
    writeDebugInfo(`Items count: ${downloadTickets.length}`);

    const corruptedItems: Array<ArtifactDownloadTicket> = downloadTickets.filter(ticket => isItemCorrupted(ticket));

    if (corruptedItems.length > 0) {
        console.log(mapLocString("CorruptedItemsList"));
        corruptedItems.map(item => console.log(item.artifactItem.metadata.destinationUrl));

        throw new Error(mapLocString('BuildArtifactNotHealthy'));
    }

    console.log(mapLocString('BuildArtifactHealthy'));
}

/**
 * This function investigates the download ticket of the artifact item.
 * 
 * Since artifact' items stored as compressed files the only appropriate way (at the moment) 
 * to make sure that the item fully downloaded is to compare bytes length before compress 
 * that provided by Azure DevOps and actual bytes length from local storage.
 * 
 * @param  {ArtifactDownloadTicket} ticket - download ticket of artifact item
 * @returns {boolean} `true` if item corrupted, `false` if item healthy
 */
function isItemCorrupted(ticket: ArtifactDownloadTicket): boolean {
    let isCorrupted: boolean = false;

    // We check the tickets only with processed status and File item type 
    if ((ticket.state === TicketState.Processed) && (ticket.artifactItem.itemType === ItemType.File)) {
        writeDebugInfo(`Start check for item: ${ticket.artifactItem.path}`);
        writeDebugInfo(`Getting info from download ticket`);

        const localPathToFile: string = ticket.artifactItem.metadata.destinationUrl;
        writeDebugInfo(`Local path to the item: ${localPathToFile}`);

        if (ticket.artifactItem.fileLength) {
            const expectedBytesLength: number = Number(ticket.artifactItem.fileLength);

            if (expectedBytesLength === NaN) {
                writeDebugInfo('Incorrect data in related download ticket, skip item validation.');
                isCorrupted = true;
            } else {
                writeDebugInfo(`Expected length in bytes ${expectedBytesLength}`);

                let actualBytesLength: number = -1;

                try {
                    actualBytesLength = getFileSizeInBytes(localPathToFile);
                    writeDebugInfo(`Actual length in bytes ${actualBytesLength}`);
                    isCorrupted = (expectedBytesLength !== actualBytesLength);
                } catch (error) {
                    writeDebugInfo("Unable to get file stats from local storage due to the following error:");
                    writeDebugInfo(error);
                    writeDebugInfo('Skip item validation');
                    isCorrupted = true;
                }
            }
        } else if (ticket.artifactItem.metadata.downloadUrl.endsWith('format=zip')) {
            // When we use a Zip Provider the Artifact Engine returns only "fileSizeInBytes"
            try {
                const expectedBytesLength: number = Number(ticket.fileSizeInBytes);
                const actualBytesLength: number = getFileSizeInBytes(localPathToFile);

                writeDebugInfo(`Expected length in bytes ${expectedBytesLength}`);
                writeDebugInfo(`Actual length in bytes ${actualBytesLength}`);

                isCorrupted = (expectedBytesLength !== actualBytesLength);
            } catch (error) {
                writeDebugInfo("Unable to get file stats from local storage due to the following error:");
                writeDebugInfo(error);
                writeDebugInfo('Skip item validation');
                isCorrupted = true;
            }
        }
    }

    return isCorrupted;
}