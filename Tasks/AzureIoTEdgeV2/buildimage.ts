import * as path from "path";
import * as fs from "fs";
import * as tl from 'azure-pipelines-task-lib/task';
import Constants from "./constant";
import util from "./util";
import { IExecOptions } from 'azure-pipelines-task-lib/toolrunner';
import * as stream from "stream";
import EchoStream from './echostream';

export async function run() {
  let templateFilePath: string = tl.getPathInput("templateFilePath", true);
  tl.debug(`The template file path is ${templateFilePath}`);
  if (!fs.existsSync(templateFilePath)) {
    throw Error(tl.loc('TemplateFileInvalid', templateFilePath));
  }
  util.setTaskRootPath(path.dirname(templateFilePath));

  util.setupIotedgedev();

  let envList = process.env;
  util.setCliVarialbe(envList, Constants.iotedgedevEnv.deploymentFileOutputFolder, tl.getVariable(Constants.outputFileFolder));

  // Pass secrets to sub process
  util.populateSecretToEnvironmentVariable(envList);

  tl.debug(`Following variables will be passed to the iotedgedev command: ${Object.keys(envList).join(", ")}`);

  let outputStream: EchoStream = new EchoStream();

  let execOptions: IExecOptions = {
    cwd: tl.cwd(),
    env: envList,
    outStream: outputStream as stream.Writable,
  } as IExecOptions;
  let defaultPlatform = tl.getInput('defaultPlatform', true);
  let command: string = `build`;
  command += ` --file ${templateFilePath}`;
  command += ` --platform ${defaultPlatform}`;
  await tl.exec(`${Constants.iotedgedev}`, command, execOptions);

  let outLog: string = outputStream.content;
  let filterReg: RegExp = /Expanding '[^']*' to '([^']*)'/g;
  let matches: RegExpMatchArray = filterReg.exec(outLog);
  if (matches && matches[1]) {
    tl.setVariable(Constants.outputVariableDeploymentPathKey, matches[1]);
    tl.setVariable('_' + Constants.outputVariableDeploymentPathKey, matches[1]);
    tl.debug(`Set ${Constants.outputVariableDeploymentPathKey} to ${matches[1]}`);
  }
}