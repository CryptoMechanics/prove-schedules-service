const axios = require("axios");

const getScheduleProofs = async (sourceChain, destinationChain) => {
  const lib = (await axios.get(`${sourceChain.nodeUrl}/v1/chain/get_info`)).data.last_irreversible_block_num;

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

      if (lastBlockProved) min_block = lastBlockProved.rows[0].block_height;

      let max_block = blocknum;
      
      //detect active schedule change
      while (max_block - min_block > 1) {
        blocknum = Math.round((max_block + min_block) / 2);
        header = await $.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}));
        if (header.schedule_version < target_schedule) min_block = blocknum;
        else max_block = blocknum;
      }
      if (blocknum > 337) blocknum -= 337;
      //search before active schedule change for new_producer_schedule 
      let bCount = 0; //since header already checked once above
      while (blocknum < max_block && !("new_producer_schedule" in header)) {
        header = await $.post(sourceAPIURL + "/get_block", JSON.stringify({"block_num_or_id":blocknum,"json": true}));
        bCount++;
        blocknum++;
      }
      blocknum--;
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
  if (bridgeScheduleData.rows.length > 0) last_proven_schedule_version = bridgeScheduleData.rows[0].producer_schedule.version;
  if (!last_proven_schedule_version) return console.log('No Schedule Found in Contract!');
  console.log("Last proved source schedule:",last_proven_schedule_version);

  let schedule = (await axios.get(sourceChain.nodeUrl+ '/v1/chain/get_producer_schedule')).data;
  var schedule_version = parseInt(schedule.active.version);
  console.log("Source active schedule:",schedule_version);

  let schedule_block = lib + 0;
  while (schedule_version > last_proven_schedule_version) {
    let block_num = await getProducerScheduleBlock(schedule_block);
    if (!block_num) return; //should never occur
    var proof = await getProof({block_to_prove: block_num});
    schedule_version = proof.data.blockproof.blocktoprove.block.header.schedule_version;
    schedule_block = block_num;
    proofs.unshift(proof);
  };

  return proofs;
};

const getProof = ({type="heavyProof", block_to_prove, action}) => {
  return new Promise(resolve=>{
    //initialize socket to proof server
    const ws = new WebSocket(sourceChain.proofSocket);
    ws.addEventListener('open', (event) => {
      // connected to websocket server
      const query = { type, block_to_prove };
      if (action) query.action_receipt = action.receipt;
      ws.send(JSON.stringify(query));
    });

    //messages from websocket server
    ws.addEventListener('message', (event) => {
      const res = JSON.parse(event.data);
      //log non-progress messages from ibc server
      if (res.type !=='progress') console.log("Received message from ibc proof server", res);
      if (res.type !=='proof') return;
      ws.close();

      //handle issue/withdraw if proving transfer/retire 's emitxfer action, else submit block proof to bridge directly (for schedules)
      const actionToSubmit = { 
        authorization: [destinationChain.auth],
        name: !action ? "checkproofd" : tokenRow.native ? "issuea" : "withdrawa",
        account: !action ? destinationChain.bridgeContract : tokenRow.native ? tokenRow.pairedWrapTokenContract : tokenRow.wrapLockContract,
        data: { ...res.proof, prover: destinationChain.auth.actor } 
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
  let mandel = chain.version >=3;
  let url = `${chain.nodeUrl}/v1/chain/send_transaction`;
  let obj = {
    transaction: {
      signatures: signedTx.signatures,
      compression: signedTx.compression || false,
      packed_trx: arrayToHex(signedTx.resolved.serializedTransaction),
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


async function proveSchedules(chains){
  console.log("\nGetting schedule proofs for", chains[0].name, "->", chains[1].name)
  const proofs1 = await getScheduleProofs(chains[0],chains[1]);
  console.log("Schedule proofs", proofs1);
  if (proofs1.length){
    const signedTx = await chains[1].wallet.transact({actions: proofs1}, {broadcast:false, expireSeconds:360, blocksBehind:3});
    const tx = await submitTx(signedTx, chains[1], 2);
    console.log("tx1", tx.processed.id)
  }

  console.log("\nGetting schedule proofs for", chains[1].name, "->", chains[0].name)
  const proofs2 = await getScheduleProofs(chains[1],chains[0]);
  console.log("Schedule proofs", proofs2);
  if (proofs2.length){
    const signedTx = await chains[0].wallet.transact({actions: proofs2}, {broadcast:false, expireSeconds:360, blocksBehind:3});
    const tx = await submitTx(signedTx, chains[0], 2);
    console.log("tx2", tx.processed.id)
  }
}

module.exports = {
  proveSchedules
}

