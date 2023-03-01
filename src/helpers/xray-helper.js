import XrayCloudClient from '../xray-cloud-client.js';
import XrayErrorResponse from '../xray-error-response.js';
import XrayCloudResponseV2 from '../xray-cloud-response-v2.js';
import FilesHelper from 'wdio-common/helpers/utils/file-helper.js';
import MergeReportHelper from 'wdio-common/lib/merge-reports.js';

const baseURL = 'https://rsklabs.atlassian.net/browse/';

export async function submitCucumberTestResults(reportsDirectory, config, testEvidenceFile) {     
    const resultsFile = MergeReportHelper.mergeJsonReports(reportsDirectory);

    const multipartConfig = FilesHelper.getJsonContent(config);
    
    console.log('Uploading reports to Jira Xray...');
    const xrayClient = new XrayCloudClient();

    return xrayClient.submitResultsMultipart(resultsFile, multipartConfig)
        .then( response => { 
            console.log('Test Execution created: \'' + baseURL + response.key + '\'');
            FilesHelper.editJsonByKey(testEvidenceFile, 'testExecutionKey', response.key);
            // DEBUG return new XrayCloudResponseV2(response);
        }).catch( error => { 
            if (error.body !== undefined)
                throw new Error(error.body.error);
            else if (error._response !== undefined)
                throw new Error(error._response);
            else
                return new XrayCloudResponseV2(error);
        });
}

export async function downloadCucumberFeatures(config) {       
    const cucumberConfig = FilesHelper.getJsonContent(config);
   
    const xrayClient = new XrayCloudClient();
    console.log('Downloading Cucumber features from Jira XRay...');
    
    return xrayClient.downloadCucumberFeatures(cucumberConfig)
        .then( function(response) {
            console.log('Features from \'' + response._response.config.url +  '\' created on \'' + cucumberConfig.featuresPath +'\'');
            // DEBUG return new XrayCloudResponseV2(response._response);
        }).catch( function(error) {
            if (error._response !== undefined && error._response.status == 400 )
                throw new Error('ERROR! Invalid keys/filter id, filter is not public or tests are not written in Gherkin sintax');   
            else if (error.body !== undefined)
                throw new Error(error.body.error);
            else
                return new XrayCloudResponseV2(error);
        });        
}

export async function uploadCucumberFeatures(config) {     
    const cucumberConfig = FilesHelper.getJsonContent(config);
    
    const xrayClient = new XrayCloudClient();
    console.log('Uploading Cucumber features to Jira XRay...');

    return xrayClient.uploadCucumberFeatures(cucumberConfig)
        .then( function(response) {
            const tests = (response._response.data.updatedOrCreatedTests.map( ({key}) => key ));
            console.log('\nFeatures successfully created/updated in Jira project ' + cucumberConfig.testExecInfo.fields.project.key);
            console.log(tests.sort());
            if (response._response.data.errors !== undefined && (response._response.data.errors).length) {
                console.log('\nErrors when uploading features...');
                console.log((response._response.data.errors).sort());
                throw new Error('Errors in feature files, please verify them');
            }
            // DEBUG return new XrayCloudResponseV2(response._response);
        }).catch( function(error) {
            if (error.response !== undefined)
                throw new XrayErrorResponse(error.response);
            else if (error.body !== undefined)
                throw new Error(error.body.error);
            else
                throw new Error(error.message || error._response);  
        });
}

export async function updateTestRunEvidence(testEvidenceFile) {       
    const testEvidenceJson = FilesHelper.getJsonContent(testEvidenceFile);

    if (testEvidenceJson.testExecutionKey === undefined)
        throw new Error(`ERROR: testExecutionKey must be defined in ${testEvidenceFile}`);

    if (testEvidenceJson.test === undefined || testEvidenceJson.test.length == 0)
        throw new Error(`ERROR: test object must be defined and/or not empty in ${testEvidenceFile}`);   

    const xrayClient = new XrayCloudClient();
    
    const testExecIssueId = await xrayClient.getTestExecutionsId(testEvidenceJson.testExecutionKey)
        .catch( function(error) {
            throw new Error(error.errorMessages);
        });

    for (const test of testEvidenceJson.test) {
        const testIssueId = await xrayClient.getTestId(test.testKey)
            .catch( function(error) {
                throw new Error(error.errorMessages);
            });
        const testRunId = await xrayClient.getTestRunId(testIssueId, testExecIssueId)
            .catch( function(error) {
                throw new Error(error.errorMessages);
            });
        await xrayClient.updateTestRunComment(testRunId, test.publicLink)
            .catch( function(error) {
                throw new Error(error.message);
            });
    }
    console.log('Browserstack public links added successfully in Test Execution \'' + baseURL + testEvidenceJson.testExecutionKey + '\'');    
}

export async function submitTestResults(reportFilePath, config) {     
    
    const multipartConfig = FilesHelper.getJsonContent(config);
    
    console.log('Uploading reports to Jira Xray...');
    const xrayClient = new XrayCloudClient();

    return xrayClient.submitResultsMultipart(reportFilePath, multipartConfig)
        .then( response => { 
            console.log('Test Execution created: \'' + baseURL + response.key + '\'');
            // DEBUG return new XrayCloudResponseV2(response);
        }).catch( error => { 
            if (error.body !== undefined)
                throw new Error(error.body.error);
            else if (error._response !== undefined)
                throw new Error(error._response);
            else
                return new XrayCloudResponseV2(error);
        });
}