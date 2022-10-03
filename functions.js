const axios = require("axios");
const WebSocket = require('ws')
const arrayToHex = data => {
  let result = '';
  for (const x of data)  result += ('00' + x.toString(16)).slice(-2);
  return result.toUpperCase();
};
const getScheduleProofs = async (sourceChain, destinationChain) => {
  const lib = (await axios.get(`${sourceChain.nodeUrl}/v1/chain/get_info`)).data.last_irreversible_block_num;
  console.log("lib",lib)
  async function getProducerScheduleBlock(blocknum) {
    try{
      const sourceAPIURL = sourceChain.nodeUrl+"/v1/chain";
      var header = (await axios.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}))).data;
      let target_schedule = header.schedule_version;
      
      let min_block = 2;
      //fetch last proved block to use as min block for schedule change search 
      const lastBlockProved = (await axios.post(destinationChain.nodeUrl+ '/v1/chain/get_table_rows', JSON.stringify({
        code: destinationChain.bridgeContract,
        table: "lastproofs", 
        scope: sourceChain.name,
        limit: 1, reverse: true, show_payer: false, json: true
      }))).data;

      if (lastBlockProved && lastBlockProved.rows[0]) min_block = lastBlockProved.rows[0].block_height;
      else min_block= 193057018
      let max_block = blocknum;
      
      //detect active schedule change
      while (max_block - min_block > 1) {
        blocknum = Math.round((max_block + min_block) / 2);
        header = (await axios.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}))).data;
        if (header.schedule_version < target_schedule) min_block = blocknum;
        else max_block = blocknum;
        // console.log("min-max",min_block,max_block)
      }
      if (blocknum > 337) blocknum -= 337;
      //search before active schedule change for new_producer_schedule 
      let bCount = 0; //since header already checked once above
      while (blocknum < max_block && (!("new_producer_schedule" in header) && !header.new_producers)) {
        header = (await axios.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}))).data;
        bCount++;
        blocknum++;
      }
      // console.log("header",header)
      blocknum=header.block_num;
      console.log("blocknum with header change",blocknum)
      return blocknum;  
    }catch(ex){ console.log("getProducerScheduleBlock ex",ex); return null;}
  }

  const proofs = [];
  const bridgeScheduleData = (await axios.post(destinationChain.nodeUrl+ '/v1/chain/get_table_rows', JSON.stringify({
    code: destinationChain.bridgeContract,
    table: "schedules", 
    scope: sourceChain.name,
    limit: 1, reverse: true, show_payer: false, json: true
  }))).data;

  
  var last_proven_schedule_version = 0;
  if (bridgeScheduleData.rows.length > 0) last_proven_schedule_version = bridgeScheduleData.rows[0].version;
  if (!last_proven_schedule_version) return console.log('No Schedule Found in Contract!');
  console.log("Last proved source schedule:",last_proven_schedule_version);

  let schedule = (await axios.get(sourceChain.nodeUrl+ '/v1/chain/get_producer_schedule')).data;
  var schedule_version = parseInt(schedule.active.version);
  console.log("Source active schedule:",schedule_version);

  let schedule_block = lib + 0;
  while (schedule_version > last_proven_schedule_version) {
    let block_num = await getProducerScheduleBlock(schedule_block);
    if (!block_num) return; //should never occur
    var proof = await getProof(sourceChain, destinationChain,{block_to_prove: block_num});
    schedule_version = proof.data.blockproof.blocktoprove.block.header.schedule_version;
    schedule_block = block_num;
    proofs.unshift(proof);
  };

  return proofs;
};

const getProof = (sourceChain, destinationChain,{type="heavyProof", block_to_prove, action}) => {
  return new Promise(resolve=>{
    //initialize socket to proof server
    const ws = new WebSocket(sourceChain.proofSocket);
    ws.on('open', (event) => {
      // connected to websocket server
      const query = { type, block_to_prove };
      if (action) query.action_receipt = action.receipt;
      ws.send(JSON.stringify(query));
    });

    //messages from websocket server
    ws.on('message', (data) => {
      const res = JSON.parse(data);
      //log non-progress messages from ibc server
      // if (res.type !=='progress') console.log("Received message from ibc proof server", res);
      if (res.type !=='proof') return;
      ws.close();

      //handle issue/withdraw if proving transfer/retire 's emitxfer action, else submit block proof to bridge directly (for schedules)
      const actionToSubmit = { 
        authorization: destinationChain.authorization,
        name: !action ? "checkproofd" : tokenRow.native ? "issuea" : "withdrawa",
        account: !action ? destinationChain.bridgeContract : tokenRow.native ? tokenRow.pairedWrapTokenContract : tokenRow.wrapLockContract,
        data: { ...res.proof, prover: destinationChain.authorization[0].actor } 
      };

      //if proving an action, add action and formatted receipt to actionproof object
      if (action) {
        let auth_sequence = [];
        for (var authSequence of action.receipt.auth_sequence) auth_sequence.push({ account: authSequence[0], sequence: authSequence[1] });
        actionToSubmit.data.actionproof = {
          ...res.proof.actionproof,
          action: {
            account: action.act.account,
            name: action.act.name,
            authorization: action.act.authorization,
            data: action.act.hex_data
          },
          receipt: { ...action.receipt, auth_sequence }
        }
      }
      resolve(actionToSubmit);
    });
  });
}

const submitTx = (signedTx, chain, retry_trx_num_blocks=null) => {
  // console.log(signedTx)
  let mandel = chain.version >=3;
  let url = `${chain.nodeUrl}/v1/chain/send_transaction`;
  let obj = {
    transaction: {
      signatures: signedTx.signatures,
      compression: signedTx.compression || false,
      packed_trx: arrayToHex(signedTx.serializedTransaction),
      packed_context_free_data: null
    }
  }
  if (mandel){
    url+='2'; //use send transaction2 if available
    obj = {
      ...obj,
      return_failure_trace: false,
      retry_trx: true,
      retry_trx_num_blocks, //if not specified, it defaults to LIB
    }
  }
  return axios.post(url, JSON.stringify(obj));
}

let running = false;
async function proveSchedules(chains){
  if(running) return;
  running = true;
  for (var sourceChain of chains) for (var destinationChain of chains.filter(c=>c.name!==sourceChain.name)){
    console.log(`Checking ${sourceChain.name} -> ${destinationChain.name}`)
      const proofs = await getScheduleProofs(sourceChain,destinationChain);
    if (proofs.length) {
      let tx, scheduleVersion;
      for (var p of proofs){
        try{
          const tx = await destinationChain.wallet.transact({actions: [p]}, {expireSeconds:120, broadcast:true,blocksBehind:3 });
          scheduleVersion = p.data.blockproof.blocktoprove.block.header.schedule_version + 1;
          console.log(`Proved ${sourceChain.name} schedule (${scheduleVersion}) on ${destinationChain.name}`, tx.processed.id);
        }catch(ex){
          console.log(`Error proving ${sourceChain.name} schedule (${scheduleVersion}) on ${destinationChain.name}`, ex)
        }
      }
    }
  }
  running = false;
}

module.exports = {
  proveSchedules
}

