import parser from "yargs-parser";
import prompts from 'prompts';
import { globSync } from 'glob';
import chalk from 'chalk';
import { lstatSync, createReadStream, readFileSync } from 'fs';
import axios from 'axios';
import FormData from 'form-data';

const rawArgs = process.argv.slice(0);
const args = parser(rawArgs);

// console.log("Unparsed args:", rawArgs);
// console.log("Parsed args:", args);


const questions = [
  {
    type: 'text',
    name: 'source',
    message: 'Path to source files',
    initial: ''
  },
  {
    type: 'text',
    name: 'ignoreFileName',
    message: 'Ignore file name',
    initial: 'metadata.json'
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
  {
    type: 'confirm',
    name: 'printAlfrescoIds',
    message: 'Print every root directory children id after upload is ready?',
    initial: true
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

const createForm = (filePath: string, title?: string, description?: string) => {
  const filedata = createReadStream(filePath)
  const formData = new FormData();
  formData.append('nodeType', 'cm:content');
  formData.append('filedata', filedata);
  formData.append('relativePath', relativePath(filePath));
  if (title) {
    formData.append('cm:title', title);
  }
  if (description) {
    formData.append('cm:description', description);
  }
  return formData;
}

const slicePath = (path: string) => {
  return path.split('/').slice(2).join('/')
}

const relativePath = (path: string) => {
  return path.split('/').slice(2, -1).join('/')
}

const fileName = (path: string) => {
  return path.split('/').pop()
}

const onlyPath = (path: string) => {
  const arr = path.split('/')
  arr.pop()
  return arr.join('/')
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
  const metadataFilePaths: string[] = [];

  const parsePaths = (paths: string[]) => {
    paths.forEach((path) => {
      if (lstatSync(path).isDirectory()) {
        folderPaths.push(path);
      }
      if (lstatSync(path).isFile() && fileName(path) !== response.ignoreFileName) {
        filePaths.push(path);
      }
      if (fileName(path) === response.ignoreFileName) {
        metadataFilePaths.push(path);
      }
    })
  }

  parsePaths(paths)


  let successResponses = [];
  let failResponses = [];
  const relativeMetadataPaths = metadataFilePaths.map((path) => onlyPath(path))

  Promise.all(filePaths.map(async (path) => {

    axios.defaults.headers['X-API-KEY'] = response.xApiKey
    axios.defaults.headers['OAM-REMOTE-USER'] = response.user
    axios.defaults.headers.cookie = response.cookies

    const relativeFilePath = onlyPath(path);

    let metadataFile = relativeMetadataPaths.find(metapath => metapath === relativeFilePath)
    metadataFile = metadataFile + '/metadata.json';
    let metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));

    const fileMetadata = metadata.files.find((item: any) => item.file === fileName(path))

    let title = null;
    let description = null;

    if (fileMetadata.title) {
      title = fileMetadata.title
    }
    if (fileMetadata.caption) {
      description = fileMetadata.caption
    }


    try {
      const data = await axios.post(`${baseUrl}/nodes/${response.rootNodeId}/children`,
        createForm(path, title, description), {
      });
      successResponses.push(data);
      console.log(chalk.greenBright(`\u2714 `) + path.split('/').pop());
      return data;
    } catch (error) {
      failResponses.push(error);
      console.log(chalk.redBright(`\u2718 `) + path.split('/').pop());
      return error;
    }
  })
  ).then(async values => {
    console.log(`Uploaded ${chalk.greenBright(successResponses.length)} files. ${failResponses.length ? 'Failed to upload ' + chalk.redBright(failResponses.length) : ''}`)
    if (response.printAlfrescoIds) {
      const rootChilds = await axios.get(`${baseUrl}/nodes/${response.rootNodeId}/children?where=(isFolder=true)`).then((res) => {
        return res.data
      });
      rootChilds.list.entries.forEach(({ entry }) => {
        console.log(`${entry.name}, ${entry.id}`)
      })
    }
  })
})();

