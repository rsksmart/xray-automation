import FilesHelper from 'wdio-common/helpers/utils/file-helper.js';
import { GraphQLClient, gql } from 'graphql-request';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import XrayErrorResponse from './xray-error-response.js';
import XrayCloudResponseV2 from './xray-cloud-response-v2.js';
import XrayCloudGraphQLErrorResponse from './xray-cloud-graphql-error-response.js';
import { XRAY_FORMAT, JUNIT_FORMAT, TESTNG_FORMAT, ROBOT_FORMAT, NUNIT_FORMAT, XUNIT_FORMAT, CUCUMBER_FORMAT, BEHAVE_FORMAT } from './index.js';
import AdmZip from 'adm-zip';
import arrayBufferToBuffer from 'arraybuffer-to-buffer';
import * as dotenv from 'dotenv';
dotenv.config()

const xrayCloudBaseUrl = "https://xray.cloud.getxray.app/api/v2";        
const authenticateUrl = xrayCloudBaseUrl + "/authenticate";


class XrayCloudClient {

    supportedFormats = [ XRAY_FORMAT, JUNIT_FORMAT, TESTNG_FORMAT, ROBOT_FORMAT, NUNIT_FORMAT, XUNIT_FORMAT, CUCUMBER_FORMAT, BEHAVE_FORMAT ];

    constructor(xraySettings) {
        const clientId = (xraySettings === undefined) ? process.env.JIRA_CLOUD_CLIENT_ID : xraySettings.clientId;
        const clientSecret = (xraySettings === undefined) ? process.env.JIRA_CLOUD_CLIENT_SECRET : xraySettings.clientSecret;
        if (clientId === undefined || clientSecret === undefined)
            throw new Error("ERROR: JIRA Cloud credentials not provided!\nDefine them on 'jira.cloud.json' or by the environment variables 'JIRA_CLOUD_CLIENT_ID' & 'JIRA_CLOUD_CLIENT_SECRET'");

        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.timeout = 300000;
        axios.defaults.timeout = this.timeout;
    }

    async submitResults(reportPath, config) {     
        if (config.format === undefined)
            throw new XrayErrorResponse("ERROR: format must be specified");

        if (!this.supportedFormats.includes(config.format))
            throw new XrayErrorResponse("ERROR: unsupported format " + config.format);

        let reportContent;
        try {
            reportContent = fs.readFileSync(reportPath).toString();
        } catch(error) {
            throw new XrayErrorResponse(error.message);
        }

        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token        
        }).then( (response) => {
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            let endpointUrl;
            if (config.format === XRAY_FORMAT) {
                endpointUrl = xrayCloudBaseUrl + "/import/execution";
            } else {
                endpointUrl = xrayCloudBaseUrl + "/import/execution/" + config.format;
            }

            let params = {};
            let url = endpointUrl;

            // all formats support GET parameters, except for xray and cucumber
            if (![ XRAY_FORMAT, CUCUMBER_FORMAT, BEHAVE_FORMAT ].includes(config.format)) {

                if ((config.projectKey === undefined) && (config.testExecKey === undefined)) {
                    throw new XrayErrorResponse('ERROR: projectKey or testExecKey must be defined (config file)');
                }
                if (config.projectKey !== undefined) {
                    params.projectKey = config.projectKey;
                }
                if (config.testPlanKey !== undefined) {
                    params.testPlanKey = config.testPlanKey;
                }
                if (config.testExecKey !== undefined) {
                    params.testExecKey = config.testExecKey;
                }
                if (config.version !== undefined) {
                    params.fixVersion = config.version;
                }
                if (config.revision !== undefined) {
                    params.revision = config.revision;
                }
                if (config.testEnvironment !== undefined) {
                    params.testEnvironments = config.testEnvironment;
                }
                if (config.testEnvironments !== undefined) {
                    params.testEnvironments = config.testEnvironments.join(';');
                }
                const urlParams = new URLSearchParams(params).toString();
                url = endpointUrl + "?" + urlParams;               
            }

            let contentType;
            if ([ JUNIT_FORMAT, TESTNG_FORMAT, NUNIT_FORMAT, XUNIT_FORMAT, ROBOT_FORMAT ].includes(config.format)) {
                contentType = 'application/xml';
            } else {
                contentType = 'application/json';
            }

            return axios.post(url, reportContent, {
                timeout: this.timeout,
                cancelToken: cancelTokenSource.token,
                headers: { 'Authorization': "Bearer " + authToken, "Content-Type": contentType }
            });
        }).then(function(response) {
            clearTimeout(timeoutFn);
            return new XrayCloudResponseV2(response);       
        }).catch(function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else
                throw new XrayErrorResponse(error.message || error._response);
        });

    }

    async submitResultsMultipart(reportPath, config) {		
        if (config.format === undefined)
            throw new XrayErrorResponse("ERROR: format must be specified (config file)");

        if (!this.supportedFormats.includes(config.format))
            throw new XrayErrorResponse("ERROR: unsupported format " + config.format);

        if ((config.testExecInfoFile === undefined) && (config.testExecInfo === undefined))
            throw new XrayErrorResponse("ERROR: testExecInfoFile or testExecInfo must be defined (config file)");

        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            //clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            let endpointUrl;
            if (config.format === XRAY_FORMAT) {
                endpointUrl = xrayCloudBaseUrl + "/import/execution/multipart";
            } else {
                endpointUrl = xrayCloudBaseUrl + "/import/execution/" + config.format + "/multipart";
            }

            let reportContent;
            let testInfoContent;
            let testExecInfoContent;
            try {
                reportContent = fs.readFileSync(reportPath).toString();
                if (config.testInfoFile !== undefined)
                    testInfoContent = fs.readFileSync(config.testInfoFile).toString();
                if (config.testInfo !== undefined)
                    testInfoContent = JSON.stringify(config.testInfo);
                if (config.testExecInfoFile !== undefined)
                    testExecInfoContent = fs.readFileSync(config.testExecInfoFile).toString();
                else
                    testExecInfoContent = JSON.stringify(config.testExecInfo);
            } catch(error) {
                throw new XrayErrorResponse(error.message);
            }

            var bodyFormData = new FormData();
            let fileName;
            if ([ JUNIT_FORMAT, TESTNG_FORMAT, NUNIT_FORMAT, XUNIT_FORMAT, ROBOT_FORMAT ].includes(config.format)) {
                fileName = 'report.xml';
            } else {
                fileName = 'report.json';
            }
            bodyFormData.append('results', reportContent, fileName);
            bodyFormData.append('info', testExecInfoContent, 'info.json');
            if ((testInfoContent !== undefined) && ([ JUNIT_FORMAT, TESTNG_FORMAT, NUNIT_FORMAT, XUNIT_FORMAT, ROBOT_FORMAT ].includes(config.format)))
                bodyFormData.append('testInfo', testInfoContent, 'testInfo.json');

            return axios.post(endpointUrl, bodyFormData, {
                timeout: this.timeout,
                cancelToken: cancelTokenSource.token,
                headers: { 'Authorization': "Bearer " + authToken, ...bodyFormData.getHeaders() }
            });
        }).then(function(response) {
            clearTimeout(timeoutFn);
            return new XrayCloudResponseV2(response);       
        }).catch(function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else
                throw new XrayErrorResponse(error.message || error._response);
        });

    }

    async authenticate() {   
        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        });
    }

    async associateTestExecutionToTestPlanByIds(testExecIssueId, testPlanIssueId) {  
        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const mutation = gql`
              mutation {
                addTestExecutionsToTestPlan(
                    issueId: "${testPlanIssueId}",
                    testExecIssueIds: ["${testExecIssueId}"]
                ) {
                    addedTestExecutions
                    warning
                }
            }
            `

            return graphQLClient.request(mutation);
        }).then(function(response) {
            return response.data.addTestExecutionsToTestPlan.addedTestExecutions[0] || testExecIssueId;
        }).catch(function(error) {
            let errorMessages = error.response.errors.map(function(err) {
                return err.message;
            });
            throw new XrayCloudGraphQLErrorResponse(error, errorMessages);
        });
    }

    async getTestPlanId(testPlanIssueKey) {
        return this.authenticate().then(authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const query = gql`
                {
                    getTestPlans(jql: "key = ${testPlanIssueKey}", limit: 1) {
                        total
                        results {
                            issueId
                        }
                    }
                }
            `

            return graphQLClient.request(query);
        }).then(function(response) {
            return response.getTestPlans.results[0].issueId;
        }).catch(function(error) {
            let errorMessages = error.response.errors.map(function(err) {
                return err.message;
            });
            throw new XrayCloudGraphQLErrorResponse(error, errorMessages);
        });
    }

    async getTestId(testIssueKey) {
        return this.authenticate().then(authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const query = gql`
                {
                    getTests(jql: "key = ${testIssueKey}", limit: 1) {
                        total
                        results {
                            issueId
                        }
                    }
                }
            `

            return graphQLClient.request(query);
        }).then(function(response) {
            return response.getTests.results[0].issueId;
        }).catch(function(error) {
            let errorMessages = error.response.errors.map(function(err) {
                return err.message;
            });
            throw new XrayCloudGraphQLErrorResponse(error, errorMessages);
        });
    }

    async getTestExecutionsId(testExecIssueKey) {
        return this.authenticate().then(authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const query = gql`
                {
                    getTestExecutions(jql: "key = ${testExecIssueKey}", limit: 1) {
                        total
                        results {
                            issueId
                        }
                    }
                }
            `

            return graphQLClient.request(query);
        }).then(function(response) {
            return response.getTestExecutions.results[0].issueId;
        }).catch(function(error) {
            let errorMessages = error.response.errors.map(function(err) {
                return err.message;
            });
            throw new XrayCloudGraphQLErrorResponse(error, errorMessages);
        });
    }

    async downloadCucumberFeatures(config) {		
        if (config.featuresPath === undefined || config.featuresPath === "")
            throw new XrayErrorResponse("ERROR: features path must be specified (config file)");
        
        if (fs.existsSync(config.featuresPath)) {
            // Prepare features backup directory
            const backupDirectory = `${config.featuresPath}_backup`;
            FilesHelper.prepareBackupDirectory(backupDirectory, false);
            // Moving feature file into backup directory
            const featureFiles = FilesHelper.getFiles(config.featuresPath, 'feature');
            featureFiles.forEach(file => fs.renameSync(file, path.join(backupDirectory, path.basename(file))));
            // Deleting featuresPath content before downloading features from Jira
            fs.rmSync(config.featuresPath, { recursive: true, force: true });
        }

        if ((config.keys === undefined) && (config.filter === undefined))
            throw new XrayErrorResponse("ERROR: XRay keys or filter must be defined (config file)");

        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            //clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            let endpointUrl;
            if (config.keys !== "") {
                // keys: a String containing a list of issue keys separated by ";"
                endpointUrl = xrayCloudBaseUrl + "/export/cucumber?keys=" + config.keys;
                if (config.filter !== "") {
                    // filter: an Integer that represents the Jira filter id
                    endpointUrl = endpointUrl + "&filter=" + config.filter;
                }
            } else {
                if (config.filter !== "") {
                    endpointUrl = xrayCloudBaseUrl + "/export/cucumber?filter=" + config.filter;
                } else {
                    throw new XrayErrorResponse("ERROR: XRay keys or filter must not be empty");
                }
            }

            return axios.get(endpointUrl, {
                timeout: this.timeout,
                cancelToken: cancelTokenSource.token,
                headers: { 'Authorization': "Bearer " + authToken },
                responseType: 'arraybuffer'
            });
        }).then(function(response) {
            const buffer = arrayBufferToBuffer(response.data);
            const zip = new AdmZip(buffer);
            try {
                zip.extractAllTo(config.featuresPath, true);
            } catch(error) {
                throw new XrayErrorResponse(error.message);
            }
            clearTimeout(timeoutFn);
            return new XrayCloudResponseV2(response);       
        }).catch(function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else
                throw new XrayErrorResponse(error.message || error._response);
        });
    }

    async uploadCucumberFeatures(config) {		
        if (config.testExecInfo === undefined)
            throw new XrayErrorResponse("ERROR: testExecInfo must be defined (config file)");
        if (config.testExecInfo.fields.project.key === undefined)
            throw new XrayErrorResponse("ERROR: project key must be specified (config file)");

        if (config.featuresPath === undefined || config.featuresPath === "")
            throw new XrayErrorResponse("ERROR: features path must be specified (config file)");
        
        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            //clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            const endpointUrl = xrayCloudBaseUrl + "/import/feature?projectKey=" + config.testExecInfo.fields.project.key;
            const zipFile = new AdmZip();
            let featuresData = new FormData();
            try {
                // features Zip file creation
                zipFile.addLocalFolder(config.featuresPath, 'features');
                zipFile.writeZip('./tmp/features/features.zip');
                // Encapsulating features file into a FormData to be sent
                const featuresFileStream = fs.createReadStream('./tmp/features/features.zip');
                featuresData.append('file', featuresFileStream, 'features.zip');
            } catch(error) {
                throw new XrayErrorResponse(error.message);
            }
            return axios.post(endpointUrl, featuresData, {
                timeout: this.timeout,
                cancelToken: cancelTokenSource.token,
                headers: {
                    ...featuresData.getHeaders(),
                    'Authorization': "Bearer " + authToken
                }
            });
        }).then(function(response) {
            clearTimeout(timeoutFn);
            fs.rmSync('./tmp', { recursive: true, force: true });
            return new XrayCloudResponseV2(response);      
        }).catch(function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else
                throw new XrayErrorResponse(error.message || error._response);
        });
    }

    async getTestRunId(testIssueId, testExecIssueId) {
        return this.authenticate().then(authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const query = gql`
                {
                    getTestRun(testIssueId: "${testIssueId}", testExecIssueId: "${testExecIssueId}") {
                        id
                    }
                }
            `

            return graphQLClient.request(query);
        }).then(function(response) {
            return response.getTestRun.id;
        }).catch(function(error) {
            let errorMessages = error.response.errors.map(function(err) {
                return err.message;
            });
            throw new XrayCloudGraphQLErrorResponse(error, errorMessages);
        });
    }

    async updateTestRunComment(testRunId, comment) {
        // use a CancelToken as the timeout setting is not reliable
        const cancelTokenSource = axios.CancelToken.source();
        const timeoutFn = setTimeout(() => {
            cancelTokenSource.cancel("request timeout");
        }, this.timeout);

        return axios.post(authenticateUrl, { "client_id": this.clientId, "client_secret": this.clientSecret }, {
            timeout: this.timeout,
            cancelToken: cancelTokenSource.token
        }).then( (response) => {
            clearTimeout(timeoutFn);
            var authToken = response.data;          
            return authToken;
        }).then( authToken => {
            const graphQLEndpoint = xrayCloudBaseUrl + "/graphql";
            const graphQLClient = new GraphQLClient(graphQLEndpoint, {
                headers: {
                  authorization: 'Bearer ' + authToken,
                },
              })

              const mutation = gql`
              mutation {
                updateTestRunComment( id: "${testRunId}", comment: "${comment}")
            }
            `

            return graphQLClient.request(mutation);
        }).then(function(response) {
            return response;
        }).catch(function(error) {
            throw new Error(error);
        });
    }

}

export default XrayCloudClient;