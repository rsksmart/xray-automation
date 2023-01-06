import XrayErrorResponse from '../xray-error-response.js';
import BrowserstackSession from '../browserstack-session.js';

export async function getSessionPublicLink(sessionID) {     
    
    const browserstackSession = new BrowserstackSession();

    return browserstackSession.getSessionPublicLink(sessionID)
        .catch( function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else if (error.body !== undefined)
                throw new Error(error.body.error);
            else
                throw new Error(error.message || error._response || error);  
        });
}


const publicLink = await getSessionPublicLink("f2b08e6a82dff962b9dd450b736392fd8589b887");
console.log(publicLink);