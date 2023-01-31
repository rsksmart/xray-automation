import axios from 'axios';
import XrayErrorResponse from './xray-error-response.js';
import * as dotenv from 'dotenv';
dotenv.config()

const BrowserstackBaseUrl = "https://api-cloud.browserstack.com/app-automate";        
const sessionsEndpoint = BrowserstackBaseUrl + "/sessions";

class BrowserstackSession {

    constructor(bsSettings) {
        const username = (bsSettings === undefined) ? process.env.BROWSERSTACK_USERNAME : bsSettings.clientId;
        const accessKey = (bsSettings === undefined) ? process.env.BROWSERSTACK_ACCESS_KEY : bsSettings.clientSecret;
        if (username === undefined || accessKey === undefined)
            throw new Error("ERROR: Browserstack credentials not provided!\nDefine them on 'bs.config.json' or by the environment variables 'BROWSERSTACK_USERNAME' & 'BROWSERSTACK_ACCESS_KEY'");

        this.username = username;
        this.accessKey = accessKey;
        this.timeout = 20000;
        axios.defaults.timeout = this.timeout;
    }

    async getSessionPublicLink(sessionID) {
        const endpointUrl = sessionsEndpoint + `/${sessionID}.json`;
        
        return axios({
            url: endpointUrl,
            method: 'GET',
            auth: {
              username: this.username,
              password: this.accessKey,
            }      
        }).then(function(response) {
            return response.data.automation_session.public_url;
        }).catch(function(error) {
            throw new XrayErrorResponse(error);
        });
    }
}

export default BrowserstackSession;