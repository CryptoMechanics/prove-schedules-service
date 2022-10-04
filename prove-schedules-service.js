const interval = 2 * 60 * 1000; //10mins

require("dotenv").config();
const { Api, JsonRpc } = require("eosjs");
const { JsSignatureProvider } = require("eosjs/dist/eosjs-jssig");
const fetch = require("node-fetch");
const { TextEncoder, TextDecoder } = require("util");
const { proveSchedules } = require("./functions");

const chains = [{
  chainId: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
  nodeUrl: 'https://jungle.eosusa.io',
  // nodeUrl: 'https://jungle4.api.eosnation.io', //api supporting send_transaction2
  name: "jungle4",
  proofSocket: "wss://jungle4-ibc.goldenplatform.com",
  bridgeContract:"antelopeibc2",
  authorization: [{actor:"nonamesfound", permission:"active"}],
  version:3.1, //Can fetch from get_info
  wallet:null
},{
  chainId: '5fff1dae8dc8e2fc4d5b23b2c7665c97f9e9d8edf2b6485a86ba311c25639191',
  nodeUrl: 'https://kylin.eosusa.io',
  // nodeUrl: 'https://kylin.api.eosnation.io', //api supporting send_transaction2
  name: "kylin",
  proofSocket: "wss://kylin-ibc.goldenplatform.com",
  bridgeContract:"antelopeibc2",
  authorization: [{actor:"brokenblocks", permission:"active"}],
  version:3.1, //Can fetch from get_info
  wallet:null
},{
  chainId: '1eaa0824707c8c16bd25145493bf062aecddfeb56c736f6ba6397f3195f33c9f',
  nodeUrl: 'https://test.telos.eosusa.io',
  name: "telostestnet",
  label: "Telos Testnet",
  proofSocket: "wss://telos-testnet-ibc.goldenplatform.com",
  authorization: [{actor:"brokenblocks", permission:"active"}],
  bridgeContract:"antelopeibc2",
  wallet:null
},{
  chainId: '5002d6813ffe275d9471a7e3a301eab91c36e8017f9664b8431fbf0e812a0b04',
  nodeUrl: 'https://testnet.uxnetwork.io',
  name: "uxpubtestnet",
  label: "UX Public Testnet",
  proofSocket: "wss://testnet-ibc.uxnetwork.io",
  authorization: [{actor:"shaq", permission:"active"}],
  bridgeContract:"antelopeibc2",
  wallet:null
},{
  chainId: 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12',
  nodeUrl: 'https://test.wax.eosusa.io',
  name: "waxtestnet",
  label: "WAX Testnet",
  proofSocket: "wss://wax-testnet-ibc.goldenplatform.com",
  authorization: [{actor:"brokenblocks", permission:"active"}],
  bridgeContract:"antelopeibc2",
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






