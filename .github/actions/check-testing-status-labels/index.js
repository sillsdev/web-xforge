const fs = require('fs');

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, { encoding: 'utf8' }));

const prLabels = event.pull_request.labels;

// Check for labels by node_id rather than name so they can be renamed later if needed
const satisfactoryLabels = [
  'LA_kwDOCvNrCM8AAAABAYQhlQ', // testing complete
  'LA_kwDOCvNrCM8AAAABGHKoGw' // testing not required
];

const satisfied = prLabels.some(label => satisfactoryLabels.includes(label.node_id));

console.log(`Pull request labels set to ${JSON.stringify(prLabels.map(label => label.name))}`);

console.log(`Testing status is ${satisfied ? 'satisfied' : 'unsatisfied'}`);

process.exit(satisfied ? 0 : 1);
