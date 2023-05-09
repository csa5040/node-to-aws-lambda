import http from "http";
import { InvokeCommand, LambdaClient, LogType } from "@aws-sdk/client-lambda";
import { curry, defaultTo } from "ramda";

const DEFAULT_REGION = "us-east-1";

const orDefaultRegion = defaultTo(DEFAULT_REGION);

const createClientForRegion = curry(
  (region, ClientConstructor) =>
    new ClientConstructor({ region: orDefaultRegion(region) })
);

const createClientForDefaultRegion = createClientForRegion(null);
const FUNC_NAME = "GetRandom";

const invoke = async (FUNC_NAME, payload) => {
  const client = createClientForDefaultRegion(LambdaClient);
  const command = new InvokeCommand({
    FunctionName: FUNC_NAME,
    Payload: JSON.stringify(payload),
    LogType: LogType.Tail,
  });

  const { Payload, LogResult } = await client.send(command);
  const result = Buffer.from(Payload).toString();
  const logs = Buffer.from(LogResult, "base64").toString();
  return { logs, result };
};

// full parallel flow for generating random numbers
async function dispatch(randomNumbers, callback) {
  const { logs, result } = await invoke(FUNC_NAME, randomNumbers);
  callback(null, result);
}

function finalResponse(res, randomValues, result) {  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.write(`Result: ${result.count} attempts & ${result.success} successful random values\n`);
  if (result.failed.length)
    res.write(`Failed to send to: \
        \n${result.failed.join('\n')}\n`);
  if (randomValues) {
    res.write(`random values:\t${randomValues}\n`);
  }
  res.end();
}

// server setup
const hostname = 'localhost';
const port = 3000;

// request handler
const server = http.createServer((req, res) => {
  let params = {};
  let myURL = {};
  try {
    myURL = new URL(req.url);
  } catch (error) {
    if (error instanceof TypeError) {
      let myURLString = `http://localhost${req.url}`;
      try {
        myURL = new URL(myURLString);
      } catch (error) {
        myURL = new URL();
      }
    }
  }

  // TODO: more idiomatic approach?
  params.min = parseInt(myURL.searchParams.get('min'));
  params.max = parseInt(myURL.searchParams.get('max'));
  params.count = parseInt(myURL.searchParams.get('count'));

  const randomNumberRequests = new Array(params.count).fill(0).map(() => ({
    min: params.min, max: params.max }));

  let count = 0;
  let success = 0;
  const failed = [];

  let values = [];

  randomNumberRequests.forEach(function (randomNumber) {
    dispatch(randomNumber, function (err, value) {
      if (!err) {
        success += 1;
        values.push(value);
      } else {
        failed.push(randomNumber.name);
      }
      count += 1;
  
      if (count === randomNumberRequests.length) {
        finalResponse(res, values, {
          count,
          success,
          failed,
        });
      }
    });
  });

});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});