#!/usr/bin/env node

const Listr = require('listr');
const execa = require('execa');
const chalk = require('chalk');
const del = require('del');
const UpdaterRenderer = require('listr-update-renderer');
const moment = require('moment');
const argv = require('minimist')(process.argv.slice(2));

const { debug, success, error, about } = require('./lib/helpers/log')('proton-bundler');
const { bash } = require('./lib/helpers/cli');
const customDeploy = require('./lib/custom');
const { pull, push, getConfig, logCommits } = require('./lib/git');

const getTasks = (branch, { isCI, flowType = 'single', forceI18n, appMode }) => {
    const { EXTERNAL_FILES, hookPreTasks, hookPostTasks, hookPostTaskClone, hookPostTaskBuild } = customDeploy(
        {
            EXTERNAL_FILES: ['.htaccess'],
            branch,
            isCI,
            flowType,
            appMode,
            forceI18n
        },
        argv
    );

    const list = [
        ...hookPreTasks,
        {
            title: 'Save dependencies if we need',
            enabled: () => !isCI && /dev|beta|alpha/.test(branch),
            task() {
                return bash('./tasks/updatePackageLock.sh');
            }
        },
        {
            title: 'Clear previous dist',
            async task() {
                await del(['dist', 'distCurrent', 'distback'], { dryRun: false });
                isCI && execa.shell('mkdir dist');
            }
        },
        {
            title: 'Lint sources',
            task: () => execa('npm', ['run', 'lint'])
        },
        {
            title: 'Setup app config',
            enabled: () => !isCI,
            task() {
                return bash('npx proton-pack', process.argv.slice(2));
            }
        },
        {
            title: 'Extract git env for the bundle',
            enabled: () => !isCI,
            async task(ctx) {
                const { commit, branch, tag } = await getConfig();
                ctx.originCommit = commit;
                ctx.originBranch = branch;
                ctx.tag = tag;
            }
        },
        {
            title: `Pull dist branch ${branch}`,
            enabled: () => !isCI,
            task: () => pull(branch)
        },
        ...hookPostTaskClone,
        {
            title: 'Copy some files',
            task() {
                const rule = EXTERNAL_FILES.length > 1 ? `{${EXTERNAL_FILES.join(',')}}` : EXTERNAL_FILES.join(',');
                return bash(`cp src/${rule} dist/`);
            }
        },
        {
            title: 'Upgrade translations inside the app',
            enabled: () => forceI18n || (!isCI && /prod|beta/.test(branch)),
            task() {
                return execa('npm', ['run', 'i18n:getlatest']);
            }
        },
        {
            title: 'Build the application',
            task() {
                const args = process.argv.slice(2);
                if (appMode === 'standalone') {
                    return execa('npm', ['run', 'build:standalone', ...args]);
                }

                return execa('npm', ['run', 'build', ...args]);
            }
        },
        ...hookPostTaskBuild,
        {
            title: `Push dist to ${branch}`,
            enabled: () => !isCI,
            task: (ctx) => push(branch, ctx)
        },
        {
            title: 'Update crowdin with latest translations',
            enabled: () => !isCI && /prod|beta/.test(branch),
            task() {
                return execa('npm', ['run', 'i18n:upgrade']);
            }
        },
        ...hookPostTasks
    ];
    return list;
};

async function getAPIUrl() {
    const args = process.argv.slice(2);
    const { stdout } = await bash('npx proton-pack print-config', args);
    debug(stdout);
    const [, url] = stdout.match(/apiUrl": "(.+)",/);
    return url;
}

async function main() {
    // Custom local deploy for the CI
    const isCI = process.env.NODE_ENV_DIST === 'ci';
    const branch = argv.branch;
    const flowType = argv.flow;
    const forceI18n = argv.i18n || false;
    const appMode = argv.appMode || 'bundle';

    debug(argv);

    if (!branch && !isCI) {
        throw new Error('You must define a branch name. --branch=XXX');
    }

    const apiUrl = await getAPIUrl();

    process.env.NODE_ENV_BRANCH = branch;
    process.env.NODE_ENV_API = apiUrl;

    about({
        ...(!isCI && { branch }),
        apiUrl,
        appMode,
        SENTRY: process.env.NODE_ENV_SENTRY
    });

    const start = moment(Date.now());
    const tasks = new Listr(getTasks(branch, { isCI, flowType, forceI18n, appMode }), {
        renderer: UpdaterRenderer,
        collapse: false
    });

    const { context } = await tasks.run();
    debug(context);

    const now = moment(Date.now());
    const total = now.diff(start, 'seconds');
    const time = total > 60 ? moment.utc(total * 1000).format('mm:ss') : `${total}s`;

    !isCI && success('App deployment done', { time });
    isCI && success(`Build CI app to the directory: ${chalk.bold('dist')}`, { time });

    if (!isCI) {
        return logCommits(branch, flowType);
    }
}

main().catch(error);
