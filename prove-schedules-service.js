const interval = 15 * 60 * 1000; //15mins

require("dotenv").config();
const { Api, JsonRpc } = require("eosjs");
const { JsSignatureProvider } = require("eosjs/dist/eosjs-jssig");
const fetch = require("node-fetch");
const { TextEncoder, TextDecoder } = require("util");
const { proveSchedules } = require("./functions");

const chains = [{
  chainId: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
  nodeUrl: 'https://jungle4.api.eosnation.io', //api supporting send_transaction2
  name: "jungle4",
  proofSocket: "wss://jungle4-ibc.goldenplatform.com",
  bridgeContract:"antelopeibc1",
  authorization: [{actor:"nonamesfound", permission:"active"}],
  version:3.1, //Can fetch from get_info
  wallet:null
},{
  chainId: '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191',
  nodeUrl: 'https://kylin.api.eosnation.io', //api supporting send_transaction2
  name: "kylin",
  proofSocket: "wss://kylin-ibc.goldenplatform.com",
  bridgeContract:"antelopeibc1",
  authorization: [{actor:"brokenblocks", permission:"active"}],
  version:3.1, //Can fetch from get_info
  wallet:null
}];

//initialize chain wallets
for (var chain of chains){
  //initialize wallet rpc
  const signatureProvider = new JsSignatureProvider([process.env[chain.name] || "5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3"]);
  const rpc = new JsonRpc(chain.nodeUrl, { fetch });
  chain.wallet = new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
    chainId: chain.chainId,
  });
}

console.log("Intialized chain wallets")

proveSchedules(chains);
setInterval(()=> proveSchedules(chains), interval);






