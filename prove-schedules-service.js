const interval = 2 * 60 * 1000; //10mins

require("dotenv").config();
const { Api, JsonRpc } = require("eosjs");
const { JsSignatureProvider } = require("eosjs/dist/eosjs-jssig");
const fetch = require("node-fetch");
const { TextEncoder, TextDecoder } = require("util");
const { proveSchedules } = require("./functions");

const chains = [{
  chainId: '8fc6dce7942189f842170de953932b1f66693ad3788f766e777b6f9d22335c02',
  nodeUrl: 'https://api.uxnetwork.io',
  name: "ux",
  label: "UX",
  proofSocket: "wss://ibc-server.uxnetwork.io/ux",
  authorization: [{actor:"ibcschedserv", permission:"active"}],
  bridgeContract:"ibc.prove",
  wallet:null
},{
  chainId: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906',
  nodeUrl: 'https://eos.api.eosnation.io',
  name: "eos",
  label: "EOS",
  proofSocket: "wss://ibc-server.uxnetwork.io/eos",
  authorization: [{actor:"ibcschedserv", permission:"active"}],
  bridgeContract:"ibc.prove",
  wallet:null
},{
  chainId: '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11',
  nodeUrl: 'https://telos.api.eosnation.io',
  name: "tlos",
  label: "Telos",
  proofSocket: "wss://ibc-server.uxnetwork.io/telos",
  authorization: [{actor:"ibcschedserv", permission:"active"}],
  bridgeContract:"ibc.prove",
  wallet:null
}];

//initialize chain wallets
for (var chain of chains){
  //initialize wallet rpc
  const signatureProvider = new JsSignatureProvider([process.env[chain.name]]);
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






