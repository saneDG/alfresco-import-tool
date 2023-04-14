import parser from "yargs-parser";
import prompts from 'prompts';
import { globSync } from 'glob';
import chalk from 'chalk';
import { lstatSync, createReadStream } from 'fs';
import axios from 'axios';
import FormData from 'form-data';

const rawArgs = process.argv.slice(0);
const args = parser(rawArgs);

// console.log("Unparsed args:", rawArgs);
console.log("Parsed args:", args);


const questions = [
  {
    type: 'text',
    name: 'source',
    message: 'Path to source files',
    initial: ''
  },
  {
    type: 'text',
    name: 'target',
    message: 'Alfresco base url that is used to upload files and folders (https://api.testivaylapilvi.fi)',
    initial: ''
  },
  {
    type: 'text',
    name: 'rootNodeId',
    message: 'Alfresco root node ID',
    initial: ''
  },
  {
    type: 'text',
    name: 'xApiKey',
    message: 'X-API-KEY'
  },
  {
    type: 'text',
    name: 'user',
    message: 'OAM-REMOTE-USER'
  },
  {
    type: 'text',
    name: 'cookies',
    message: 'Cookies used in requests calls'
  },
];

const findItemIndex = (name: string) => {
  return questions.findIndex(match => name === match.name)
}

// Set value as initial if given as command argument
if (args.source) {
  questions[findItemIndex('source')].initial = args.source;
}
if (args.target) {
  questions[findItemIndex('target')].initial = args.target;
}
if (args.rootNodeId) {
  questions[findItemIndex('rootNodeId')].initial = args.rootNodeId;
};
if (args.xApiKey) {
  questions[findItemIndex('xApiKey')].initial = args.xApiKey;
};
if (args.user) {
  questions[findItemIndex('user')].initial = args.user;
};
if (args.cookies) {
  questions[findItemIndex('cookies')].initial = args.cookies;
};

const listOfPaths = (path: string) => {
  return globSync(path + '/**/*');
}

const baseUrl = `${args.target}/alfresco/api/-default-/public/alfresco/versions/1`

const createForm = (filePath: string) => {
  const filedata = createReadStream(filePath)
  const formData = new FormData();
  formData.append('nodeType', 'cm:content');
  formData.append('filedata', filedata);
  formData.append('relativePath', relativePath(filePath));
  return formData;
}

const slicePath = (path: string) => {
  return path.split('/').slice(2).join('/')
}

const relativePath = (path: string) => {
  return path.split('/').slice(2, -1).join('/')
}

(async () => {
  const response = await prompts(questions as any);
  const paths = listOfPaths(response.source)
  paths.forEach(path => console.log(chalk.magenta(`  ${slicePath(path)}`)))

  await prompts({
    type: 'confirm',
    name: 'confirmPaths',
    message: 'Uploading files and directories above to Alfresco. Confirm?',
    initial: true
  })

  const folderPaths: string[] = [];
  const filePaths: string[] = [];

  const parsePaths = (paths: string[]) => {
    paths.forEach((path) => {
      if (lstatSync(path).isDirectory()) {
        folderPaths.push(path);
      } else if (lstatSync(path).isFile()) {
        filePaths.push(path);
      }
    })
  }

  parsePaths(paths)


  let successCount = 0;
  let failCount = 0;

  Promise.all(filePaths.map((path) => {
    axios.post(`${baseUrl}/nodes/${response.rootNodeId}/children`,
      createForm(path), {
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-API-KEY': response.xApiKey,
        'OAM-REMOTE-USER': response.user,
        cookie: response.cookies,
      },
    }).then((data) => {
      successCount++;
      console.log(chalk.greenBright(`\u2714 `) + path.split('/').pop());
    }).catch((error) => {
      failCount++;
      console.log(chalk.redBright(`\u2718 `) + path.split('/').pop());
    })
  })
  )
})();

