const { writeFile, lstatSync, readdirSync, readFileSync, existsSync } = require('fs');
const { join, dirname, resolve, parse } = require('path');
const mkdirp = require('mkdirp');
const YAML = require('yamljs');
const origin = require('git-origin-url');
const branchName = require('current-git-branch');

const entryFolder = 'docs';
const docRoot = resolve(__dirname, entryFolder);

origin((err, url) => {
  if (err) throw err;

  const branch = branchName();
  if (!branch) throw 'no branch name';

  const githubUrl = `${url.split('.git')[0]}/tree/${branch}/`;

  const matchName = nameToMatch => (name) => {
    if (typeof name === 'string') {
      return name === nameToMatch;
    }
    return Object.keys(name)[0] === nameToMatch;
  };

  function findAllHeaders(sourceString, aggregator = {}) {
    const arr = /(#+)(.*)/.exec(sourceString);

    if (arr === null) return aggregator;

    const newString = sourceString.slice(arr.index + arr[0].length);

    const headerType = arr[1]; // # or ## etc
    const headerValue = arr[2].trim();
    const newAgg = Object.assign({}, aggregator);

    if (headerType in aggregator) {
      newAgg[headerType].push(headerValue);
    } else {
      newAgg[headerType] = [headerValue];
    }

    return findAllHeaders(newString, newAgg);
  }

  const isDirectory =
    source =>
      lstatSync(source).isDirectory();

  const getDirectories =
    source =>
      readdirSync(source).map(name => join(source, name));

  const rootContents = getDirectories(docRoot);

  const compileDirectory = (contents, pathname, path = '') => {
    const orderPath = `${pathname}/_order.yml`;
    const order = existsSync(orderPath) ? YAML.load(orderPath) : null;

    return contents
      .map(item => parse(item))
      .sort((a, b) => {
        const aOrder = order ? order.findIndex(matchName(a.name)) : a.name;
        const bOrder = order ? order.findIndex(matchName(b.name)) : b.name;

        if (aOrder < bOrder) return -1;
        if (aOrder > bOrder) return 1;
        return 0;
      })
      .reduce((acc, item) => {
        const { base, name, ext, dir } = item;
        const newPathname = `${dir}/${base}`;

        if (!isDirectory(newPathname)) {
          if (ext !== '.md') return acc;

          // if it's markdown, write contents to the object
          const content = readFileSync(newPathname, 'utf8');
          const headers = findAllHeaders(content);

          // TODO redundant?
          return [...acc, {
            name,
            title: headers['#'] ? headers['#'][0] : name,
            content,
            url: `${githubUrl}${entryFolder}${path}/${base}`,
            headers,
          }];
        }

        // if directory, recurse through the subdirector
        const content = compileDirectory(getDirectories(newPathname), newPathname, `${path}/${base}`);
        const title = order.find(matchName(name));

        return [
          ...acc,
          {
            name,
            title: typeof title === 'string' ? title : title[Object.keys(title)[0]],
            content,
            url: `${githubUrl}${entryFolder}${path}/${base}`,
          },
        ];
      }, []);
  };

  const fileName = branch === 'master' ? 'bundle.json' : 'bundleDev.json';

  writeFile(
    fileName,
    JSON.stringify(compileDirectory(rootContents, docRoot)),
    'utf8',
    (err) => {
      if (err) return console.log(err);

      console.log(`${fileName} successfully written.`);
      process.exit();
    },
  );
});
