'use strict';
/* GALLEY 1.42: immutable audio preservation and callback deadline profiles.
 * Default checks are portable: all expected PCM comes from commit 244ab5b,
 * never the working DSP. --record-baseline alone requires Git and updates the
 * compact embedded capture. --bench is informational and requires an idle CPU.
 *
 * node loom/performance-142-checks.cjs
 * node loom/performance-142-checks.cjs --calls --fixtures dry-2,cabinet-4-modulated
 * node loom/performance-142-checks.cjs --bench --fixtures dry-2,light-4,mixed-4,mixed-10
 *   --refs 244ab5b41d14e42c8a588aea9a180725d0b71cba,working --blocks 1024 --warmup 512 --trials 3
 * GALLEY_142_REPORT=/tmp/galley-142.json writes machine-readable results.
 * Native polyphonic inputs are pre-rendered; hosted instrument/UI CPU requires
 * the separate browser experiment. Timings are never correctness assertions.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, webcrypto } = require('node:crypto');
const { PerformanceObserver } = require('node:perf_hooks');
const BASELINE = '244ab5b41d14e42c8a588aea9a180725d0b71cba';
const TYPES = ['prism','velvet','cinder','undertow','parallax','vestige','halo','tremor','broiler','glaze','scales','strainer','swirl','crumble','saute','preserve','tinpan','ferment','sunday','cellar','board','cupboard'];
const CATALOGS = ['vocal','utility','filter','creative','preamp','tape','char','lofi','pedal-synth','deluxe','svt','guitar-pedals','cabinet'];
const PROCESSORS = ['vocal-dsp','utility-dsp','filter-dsp','creative-dsp','broiler-pedals','compressor-dsp','preamp-dsp','tape-dsp','char-dsp','lofi-dsp','pedal-synth-tracker','pedal-midi-dsp','pedal-synth-dsp','deluxe-dsp','svt-dsp','guitar-pedals-dsp','hood-dsp','cabinet-dsp','effects','service-schema','lfo','schema','cpu-profiler','track-eq-dsp','mastering-dsp','audio-engine'];
const FILES = ['shared/pattern-schema.js',...CATALOGS.map(name=>'loom/'+name+'-catalog.js'),'loom/effects-catalog.js',...PROCESSORS.map(name=>'loom/'+name+'.js')];
const AUTOMATE = {prism:'cutoff',velvet:'threshold',cinder:'drive',undertow:'depth',parallax:'time',vestige:'decay',halo:'fine',tremor:'depth',broiler:'drive',glaze:'ceiling',scales:'input',strainer:'cutoff',swirl:'rate',crumble:'bits',saute:'drive',preserve:'drive',tinpan:'drive',ferment:'cutoff',sunday:'volume',cellar:'gain',board:'drive',cupboard:'mic1X'};
const PATCHES = {
  prism:{low:1,mid:-2,high:.7,filter:'lowpass',cutoff:4700,resonance:1.1,mix:.8},
  velvet:{model:'fet-76',threshold:-26,ratio:4,colour:.4,input:2,makeup:0,mix:.75},
  cinder:{shape:'diode',drive:11,output:-9,mix:.6}, undertow:{rate:.7,depth:2,mix:.35},
  parallax:{clock:'free',time:173,feedback:.3,mix:.25},vestige:{model:'plate',decay:1.2,mix:.2},
  broiler:{model:'iron-800',drive:13,output:-12,mix:.6},saute:{model:'tube-610',drive:9,output:-7,mix:.7},
  preserve:{drive:7,output:-7,mix:.7},tinpan:{drive:7,noise:.13,crackle:.17,output:-7,mix:.6},
  ferment:{mode:'chord',filterModel:'ladder',cutoff:1700,resonance:.6,output:-8},
  sunday:{model:'nodal',volume:4,reverb:3,output:-8},cellar:{cabinet:'di',output:-8},
  cupboard:{model:'open112',room:.2,alignment:'natural',stereo:'split',mic1Enabled:'on',mic2Enabled:'on',mic2Type:'ribbon121',mic2Level:-8,mic2Pan:-.35,mic3Enabled:'on',mic3Type:'condenser87',mic3Level:-13,mic3Pan:.4,mic4Enabled:'on',mic4Type:'omni',mic4Level:-17,output:-6,mix:.8}
};
const CORE_CASES = ['dry-2','dry-10','light-4','mixed-4','mixed-10','cabinet-2','cabinet-4','cabinet-4-modulated','arrangement-10','state-edits-4'];
const FROZEN = /* FROZEN-BEGIN */ {
  "baseline": "244ab5b41d14e42c8a588aea9a180725d0b71cba",
  "definitionsSHA256": "d5ed48da9f5a9bbfab5bbdd583ddfa60645454987399640eaa52df49113a0a37",
  "scenarioSHA256": "660a1f3f9c04f18a8e01fa6497704e3cb244fef433fb201c2b7e08391979291c",
  "sourceHashes": {
    "shared/pattern-schema.js": "4ac23f8655bfb8b8653a286c805829dac46aba23c44b79f8dad118adea4cc58a",
    "loom/vocal-catalog.js": "b7d08125dee5c30228d6edee55ef13b6fe9ffabad9aff323bc2a8d1bda80b103",
    "loom/utility-catalog.js": "a910a2cfa1769ef18b65a448f5b6e02f2212c790df3fa68a0202e55aa7e0834f",
    "loom/filter-catalog.js": "9d45ebd1ad93809e2c02dca07268015ee5575f781d5fc57802bebd35c252fd4a",
    "loom/creative-catalog.js": "a7a17a4096f4d7b127f5f97a0fc2b28653787c4d1496fc568f9f666f205c30c8",
    "loom/preamp-catalog.js": "a311f4f9fc38e1bd91f80e0a1de45f74476e3de84d325cf62ef0622acb526727",
    "loom/tape-catalog.js": "a0b00d1cfcf41d75bcdd1e5609db4134c96692c7626372590ec05386097a3054",
    "loom/char-catalog.js": "bee97b7b9d9f17d5079f30f82dee1009407f63355d2dfdd91400a3ee98a0c957",
    "loom/lofi-catalog.js": "3c69f4287a653fac9e32c014420c33878ca89333b24b164f158d59b426c22a8e",
    "loom/pedal-synth-catalog.js": "c325f96621363cc79fd7b00b6454047a1dec11220f19a16bfc8f247678f9a9ec",
    "loom/deluxe-catalog.js": "bc470d78a313bab9a984bae637fd97a8ecf76f304ec63a4920fe309c669995f5",
    "loom/svt-catalog.js": "88284e0f9eeb924aeab38c4e9053c4b7638f8dc02c797e6efffd94adc6d17328",
    "loom/guitar-pedals-catalog.js": "501e89d2929f4e138944fad40051006a7cefb9cdcbf2cba1d7995366d571f311",
    "loom/cabinet-catalog.js": "5822b3f2524bbf54d5cdd1a123a492d3f5a96e34793ec948ab9f4972ca20e7cf",
    "loom/effects-catalog.js": "8d28b4a161f05c369889a15526866af7c6038b7493f4f9c74813f601f283cec5",
    "loom/vocal-dsp.js": "8fc84009623ab2509e06d52d74bc2c237123016ec8ef40e40e6a1ffad1340d4d",
    "loom/utility-dsp.js": "3574688e05480bf92c411d74f0a9ea9aa123274d161439d20d767e6ed9090570",
    "loom/filter-dsp.js": "8be15f1ed19c4266a0dd824fb93e8f72fb986dc69e033b18aadd043928117ae6",
    "loom/creative-dsp.js": "b6779c44d7a69fc57ad4db84b63a511dfeec5a15688ec6c68d2a50581560e6aa",
    "loom/broiler-pedals.js": "1627c303b7109186f5fe1f0e71f35d070565aa3130d3fef6402aae6f5510d05c",
    "loom/compressor-dsp.js": "bc48f99600d2027e5748284cb323f07989a79959647ac06633739bcf306c1974",
    "loom/preamp-dsp.js": "60113271bbd15d6abcfb18f4dc799e8db537ad7b8e35e9a7edcc52a13f744801",
    "loom/tape-dsp.js": "fbfd8e2eaf6d2d973f2c7241f420a7700acca0372594fcec949344b15ecf9aaf",
    "loom/char-dsp.js": "3591601edac9bbdfecd6edab698df2cb654ce24e61dd45df6030dfff18d794e2",
    "loom/lofi-dsp.js": "baac055587634c4197080f0b27c363a1a1e90f39ad3fb41c929ce2ef233c196d",
    "loom/pedal-synth-tracker.js": "6bf28039518a1d7b34ecf6df03aa3fed91292271fce02fef3bba59901d256fdc",
    "loom/pedal-midi-dsp.js": "e61b505311ea08f600cc6cd04e1f0fa91bde81c106a5235484846feb973b7026",
    "loom/pedal-synth-dsp.js": "bbf16ba9d53176f9f9df569f699ab27c25003a188a044d073e31275acb20bbca",
    "loom/deluxe-dsp.js": "f33ce0c8720868e318e79c4d50c5d56548fa8f3950201a3018f9ab0d04c5125c",
    "loom/svt-dsp.js": "cef60999d1abce77e382bc3f485ac90b837d95b4c8de631c8c0875954637ccf5",
    "loom/guitar-pedals-dsp.js": "f9006bf0c87dd0f3d131b3a55c959f486743edc98ed28d3fa9e6610e176bef4e",
    "loom/hood-dsp.js": "6bfafbcf1321426dc22542d593859a59e546d3937e6f7929ecf8729fbe5ca552",
    "loom/cabinet-dsp.js": "0be2f838823e0f7f344a0d05e898bf69ba42240b25c09a3ac20a84e7204151c5",
    "loom/effects.js": "0d84951c3aee909fa85f5639dab321915c8328e53d3f94175360d48500b8e4b7",
    "loom/service-schema.js": "22fa585206eb77ca246dbf59cc589e68dbf26382fd975e3c2e79cd7f3841909e",
    "loom/lfo.js": "541eeafb49ec6d7d1d6957c7b2272aff1235c6c3e04aa4f7909fda60760ee16c",
    "loom/schema.js": "37c11e34551be6a5837fc81d8a90098c35d603c608fad2181ae17addb1b62359",
    "loom/cpu-profiler.js": "58f7c349b06f383b47d63e7a689247725f85819b7d4f371b696989aaa4b62f34",
    "loom/track-eq-dsp.js": "6890c21877395671bf44f55b7d3c54cd918a09c2f0940cf01f78e124da509fa4",
    "loom/mastering-dsp.js": "4251924180a93eed2594127dfb18b414af45b5cc0c2db113c9dc2c99cc2e5161",
    "loom/audio-engine.js": "edf2485dc8ff341c04350d06c59d9a1a40588668faff0238b2295e53e74ed6fe"
  },
  "effects": {
    "prism/static": "db51291eba5cec3f93fa1ccd6faa7c2446a6b00eff6a2574fd68e216f6ab2b8f",
    "prism/modulated": "04c2496db3c16104aadbade3844d475771ce9f3218a5d0112e55c4ab1fcb8d4f",
    "velvet/static": "a8fb3666039b9f24938c3bf729db0efaaa2c89c871c93846da13cc01fd91e854",
    "velvet/modulated": "1478ba2b541ecb80e888ae406b650918a3b16bf0c07b86c5418b4be9e77526f8",
    "cinder/static": "3dc3665f1304456a2c7ce2170df2d444337599cc46deb969d5728e4a235a9687",
    "cinder/modulated": "fc9f10268a021610678e35525ce4847755b3566d1708c8f49d92d12f6dabc37a",
    "undertow/static": "f7125f5e5fd001c3c3b09459ba36838fc086f9283a9919b91679c30ae798032f",
    "undertow/modulated": "1802bfb27211f7d3ccb5ca21cb86ceec52c78eed5e90e1419d13c45e1de2d2d7",
    "parallax/static": "ed766637015d92061d2715784f32d445cc6ee2dd9cc5ba7b992002e9b28ba46c",
    "parallax/modulated": "ed766637015d92061d2715784f32d445cc6ee2dd9cc5ba7b992002e9b28ba46c",
    "vestige/static": "3fa38b4210afbc9797d225d3413a14f236f36e9616888d5cc5ab29c4fa16863e",
    "vestige/modulated": "36e9765bd771316b8173cb3d3e3d4e90c953fa74bdf2148c3e9d0e75b6659936",
    "halo/static": "2408439f132d9b991ac57b261dbc71797ecb89d2fd78601c2c85fa2d0d003ab8",
    "halo/modulated": "f10312a02b078f642c091d57b16de8d3991696ecefd5b0b45a95f74421c8beb9",
    "tremor/static": "957f1c991fffdf8bebb7bf0aad51ab004dc2345be92bfe532d5b26fa2396cffb",
    "tremor/modulated": "5f5d92863cfa3a1bcbc00b1ba229e9b253e2fd81777a734223d72ab78e7ab316",
    "broiler/static": "402eb6c29cb0124b6016d9c890532c00516d11038c81382c8bf50776ca56a093",
    "broiler/modulated": "d630a013631d7051affe0322e270a23a1cbc7c13176d8a26bfb7d6ae08d1838f",
    "glaze/static": "17a9b637657119d3123aa1a9c0538d02e328635928d5bfb4517924a543002493",
    "glaze/modulated": "debe2ed2c942a6b27b1d0dcdda06713da10f3e602821458767e4f1df889b2071",
    "scales/static": "01a3dc22d1cd686eb7eb88f01e5626c64e4f62ba36413fbcf9fe4e9444cf8d00",
    "scales/modulated": "03bed0da8a674c680d37f1a55af1ce7b14f4cc29bbc3c65d0c3df72c69122ad0",
    "strainer/static": "76b4f9a1e8f517f91384d377b0b70cb296cd84579235b87bec0ea38d7beffc85",
    "strainer/modulated": "e163ec38e4ac97ab521dee1864997f203a5bdcfdcd87a5c1ebbb36e0431e9bc8",
    "swirl/static": "02d0f0171cc2c03d96744f8a296cee9aac41b3f09339516dd1741feb96c8d720",
    "swirl/modulated": "aa52da562dc901063a57d92b54b5a2692bbaae0ceee9036bc532b338c7ed6b5d",
    "crumble/static": "fbc9d8d41edf670a54612e3f520a9e4986e921b20eff6adb3079be993293f706",
    "crumble/modulated": "bdd2ae133e69513d9a7169bb3878fab74e6169cb5e47e5dff597a7da6cf43aad",
    "saute/static": "c77ce1e9a5d1acab8e6ce185a601f55a37c9a48b1dae3c92a9e489f1afcb4034",
    "saute/modulated": "d58e421f5e3fbe0e44df016fa3846ce235bdcea171ac6270f158601e4980ec55",
    "preserve/static": "fd757bb3a87ead0dcc8f756e27ed87744c3e04d2dbb7b5b47860b288e86132fb",
    "preserve/modulated": "7bc33efd649e8474f657ff02a374226100f4db0ba838166abcf4e0f8b2e1c43f",
    "tinpan/static": "15a173a75cc07c92bd1df07bcf94892d25444a39815aede09f6a4f63fad1867c",
    "tinpan/modulated": "b52f02f3959178ee938d81b1d6b74240b5c87d00e8bba272be04b6535ed846b3",
    "ferment/static": "fdbfca296ac217a76d7029558b30bbc907ebfe9b10a4a702fef988313f747aa5",
    "ferment/modulated": "603f99a2f8037f6b19d7e300421948300221da0a6d60ad5e511004fa75034439",
    "sunday/static": "b087d921b62bc66825f6bfb1693bfc3d6665d280814889dadbfb2017d0269a3b",
    "sunday/modulated": "24b61cbce13ff0143d22f822805755549cdcd5bdd2e3625ac7d34a207c501554",
    "cellar/static": "f8162c892694a10569f8a033396c5e43ad61b5f4b4630c61315ed629450e2337",
    "cellar/modulated": "a0995efc4374a0d199d00eaed51011e29e07fc398ed1b7ef5933482a36694a52",
    "board/static": "d7d696f03bca47c782f734256959a931c11312fe8509e900d396818c4b6cf7a9",
    "board/modulated": "56027859bc0d643b145bf1d5bbb0ec67f60ccfd9673822d4bdb0997232d526d2",
    "cupboard/static": "70a28181466598d029ab43331896914e9351e703e5305e14ee4584d95178d2ae",
    "cupboard/modulated": "1b528e005f57ead61534347cb53fcbaa5764f3369600702a843359254f5a75c4",
    "cupboard/multimic/44100": "43565f68f4429fe45c4e817c61e8633b8fdb22a93d278e32f00696a58468e712",
    "cupboard/multimic/96000": "aaee5c12ef24109f22e72249280253c4abb3af1ce6f55263b615c20cdab7f655",
    "cupboard/multimic/192000": "42b940c1c08896595f7209236848445b6e2b3edd5e1523184f2a8a5567591ff4",
    "board/mono-circuit/bluesdriver/high/8000": "a95e0bbf966775f81795f0c8b907974e54def2988d63fc287beccf94f3cd68b0",
    "board/mono-circuit/bluesdriver/high/48000": "a52be50b596e096053ee49b46f9261875e19da7e009c4a167e1bf1cb1dda26a8",
    "board/mono-circuit/bluesdriver/eco/8000": "f7932435b89f0241f472e25f15c68f6328a3a0874f16dfff8327cc023f66a6e9",
    "board/mono-circuit/bluesdriver/eco/48000": "82137737fdfedc1b0ce3a78068e41d7b29074559a95427e5807c06aa6ac5c706",
    "board/mono-circuit/screamer/high/8000": "e97da46b5fd5ed8be820ec96fc851f5580868471124d54620420470d92517a61",
    "board/mono-circuit/screamer/high/48000": "e04d9efe3c38ccf3256fbdd0262fba4fcb68491d8f7745c2efe50a05d98d89a9",
    "board/mono-circuit/screamer/eco/8000": "ffcb76b343548a134ddc93531431125a0d44c80e88d23f946c03b81ff45f9e26",
    "board/mono-circuit/screamer/eco/48000": "9536b6d02f6542aa509265bb183afa01fdcde39dbb2b9ebc527a633f2c718a7b",
    "board/mono-circuit/rodent/high/8000": "56ad1f9b81b9c0dfbec89466d27907655f53b15e887eb5291344d83eb5dd2b2c",
    "board/mono-circuit/rodent/high/48000": "865a5061424234748eda403ec5175531bc254a895abd5e32ddabf9c34b2735d0",
    "board/mono-circuit/rodent/eco/8000": "ea98f196e76862462e9fdc4a27773c725f9e6ae08130a54e54ea3b56a35948d3",
    "board/mono-circuit/rodent/eco/48000": "efe3b5f504ccd5b5d437cf259994f2f9ee91170218ef88edc6e20628d06f5379",
    "board/mono-circuit/fuzz/high/8000": "f8901d7216154c23067d3d55e958450beee1feff076c035690b9002cb6f326c3",
    "board/mono-circuit/fuzz/high/48000": "4574dda9db66a6f4feef01fac4f36acdea399655548b326b323b1b1a203fbc4f",
    "board/mono-circuit/fuzz/eco/8000": "1d6cfcdce51b734d432f09116472a84e333ef367db6ab7ef23ea486d104450fe",
    "board/mono-circuit/fuzz/eco/48000": "62866eb812bfdcd2331f979585c68a7e69037647316be7cf7b47d28bf5655a82",
    "cupboard/stereo-history/8000": "4d7c4e2aa143c8fa2eb62f82452471bf6869622fffa5ae1fa2b24aede9860932",
    "cupboard/stereo-history/48000": "bbc30291a3c76fa7773c6745cb04f4e3fb41a892d7b74ace69465178da5a33bc",
    "cupboard/stereo-history/192000": "bbb1331b2e69c7256d65ebe14b985aad044eb07d0486ce6d63c840d0e04c56a5"
  },
  "cores": {
    "dry-2/128": "58351fffa161cbee517ccfc5ee4099219ce26193f0035abc642ac530230cf36e",
    "dry-2/137": "58351fffa161cbee517ccfc5ee4099219ce26193f0035abc642ac530230cf36e",
    "dry-10/128": "067919c1c9c72b23966326880af7e8287d3e752c9cedcbea2964ab182a64ad8f",
    "dry-10/137": "067919c1c9c72b23966326880af7e8287d3e752c9cedcbea2964ab182a64ad8f",
    "light-4/128": "66a64307e849765e0380592cc12eaff66c384e99a485abdfd08a7de8f2598f4f",
    "light-4/137": "66a64307e849765e0380592cc12eaff66c384e99a485abdfd08a7de8f2598f4f",
    "mixed-4/128": "91b955b9fcb70306264ee3827fdfa8e2d4321c48d2fe1b0f108d0c28de796301",
    "mixed-4/137": "91b955b9fcb70306264ee3827fdfa8e2d4321c48d2fe1b0f108d0c28de796301",
    "mixed-10/128": "46a9fa5ade6cbd33252ca096b644ee47aef4eac1b32c2d83ff1104fba772ca21",
    "mixed-10/137": "46a9fa5ade6cbd33252ca096b644ee47aef4eac1b32c2d83ff1104fba772ca21",
    "cabinet-2/128": "cf6e221a5123fe11e28febdb22f111d61a27e136ee7914b15c4d39a9015a8519",
    "cabinet-2/137": "cf6e221a5123fe11e28febdb22f111d61a27e136ee7914b15c4d39a9015a8519",
    "cabinet-4/128": "9c8529c7a268aef7c6bd505ff4e924ade54e2d0214caf244145a668d45608609",
    "cabinet-4/137": "9c8529c7a268aef7c6bd505ff4e924ade54e2d0214caf244145a668d45608609",
    "cabinet-4-modulated/128": "6a634cc73dde4a3ca1d61c32d60dd456200c5b183efec80a408ba5407efe8537",
    "cabinet-4-modulated/137": "6a634cc73dde4a3ca1d61c32d60dd456200c5b183efec80a408ba5407efe8537",
    "arrangement-10/128": "f014a09979d2e0bc1fe38b566b184545e312a848225e6d2c474ac1d00cc5c3bc",
    "arrangement-10/137": "f014a09979d2e0bc1fe38b566b184545e312a848225e6d2c474ac1d00cc5c3bc",
    "state-edits-4/128": "fdad48d5b10625b389ae168a532788fca2b492e3b2f4c98a32b1b3bbb90765a9",
    "state-edits-4/137": "607025d7047be8c15b4583b7759062107f6a065e18782b6e69a0ca5fde99798e"
  }
} /* FROZEN-END */;
const sourceCache = new Map();
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const pcm = audio => {const h=createHash('sha256');for(const channel of audio)h.update(Buffer.from(channel.buffer,channel.byteOffset,channel.byteLength));return h.digest('hex');};
function sourceFile(file) {return file.startsWith('loom/')?path.join(__dirname,file.slice(5)):fs.existsSync(path.join(__dirname,file))?path.join(__dirname,file):path.join(__dirname,'..',file);}
function readSource(ref,file) {
  const key=ref+':'+file;
  if(ref==='working')return fs.readFileSync(sourceFile(file),'utf8');
  assert.equal(ref,BASELINE,'Historical sources must identify the immutable 1.42 commit');
  if(!sourceCache.has(key))sourceCache.set(key,execFileSync('git',['show',ref+':'+file],{cwd:path.join(__dirname,'..'),maxBuffer:12*1024**2,stdio:['ignore','pipe','pipe']}).toString());
  return sourceCache.get(key);
}
function load(ref='working',instrument=false) {
  const metrics={},count=key=>metrics[key]=(metrics[key]||0)+1;
  const scope={console,Date,crypto:webcrypto,Blob,AbortController,setTimeout,clearTimeout,TextEncoder,TextDecoder,structuredClone};
  scope.window=scope;scope.globalThis=scope;scope.performance=instrument?{now(){count('performance.now');return performance.now();}}:performance;
  scope.atob=value=>Buffer.from(value,'base64').toString('binary');scope.btoa=value=>Buffer.from(value,'binary').toString('base64');
  const math=instrument?Object.create(Math):Math;
  if(instrument)for(const name of ['sin','cos','tan','tanh','atan','pow','exp','log','log2','log10','sqrt','hypot'])math[name]=(...args)=>{count('Math.'+name);return Math[name](...args);};
  const typed=Native=>instrument?new Proxy(Native,{construct(target,args){count('new '+target.name);return Reflect.construct(target,args);}}):Native;
  const arrayTypes=[Float32Array,Float64Array,Uint8Array,Int32Array].map(typed);
  const object=instrument?new Proxy(Object,{get(target,key){if(['keys','entries','fromEntries','assign'].includes(key))return(...args)=>{count('Object.'+key);return target[key](...args);};return Reflect.get(target,key);}}):Object;
  const json=instrument?Object.create(JSON):JSON;
  if(instrument)for(const name of ['parse','stringify'])json[name]=(...args)=>{count('JSON.'+name);return JSON[name](...args);};
  const sourceHashes={};
  for(const file of FILES){const source=readSource(ref,file);sourceHashes[file]=sha(source);Function('window','globalThis','crypto','atob','btoa','Math','Object','JSON','Float32Array','Float64Array','Uint8Array','Int32Array',source+'\n//# sourceURL=galley-142-'+ref+'-'+path.basename(file))(scope,scope,webcrypto,scope.atob,scope.btoa,math,object,json,...arrayTypes);}
  if(instrument){const make=scope.createLoomEffectsDSP;scope.createLoomEffectsDSP=(...args)=>{const effects=make(...args),create=effects.create;effects.create=(type,...values)=>{const effect=create(type,...values);for(const name of ['setParams','process','getMeters','reset'])if(typeof effect?.[name]==='function'){const original=effect[name];effect[name]=function(...args){count(type+'.'+name);return original.apply(this,args);};}return effect;};return effects;};}
  const E=scope.createLoomEffectsDSP(),DSP=scope.createLoomEngineDSP(scope.createLoomEffectsDSP,scope.createLoomLFODSP,scope.createLoomCPUProfiler,scope.createLoomTrackEQDSP,scope.createLoomMasteringDSP);
  if(instrument)for(const name of ['_syncDiagnosticsTopology','beginDiagnostics','endDiagnostics','diagnosticsStart','diagnosticsEnd','getDiagnostics']){const original=DSP.Core.prototype[name];if(original)DSP.Core.prototype[name]=function(...args){count('Core.'+name);return original.apply(this,args);};}
  return {ref,scope,E,DSP,S:scope.LoomSchema,sourceHashes,metrics,clear(){for(const key of Object.keys(metrics))delete metrics[key];}};
}
function polySignal(frames,rate=48000,track=0,offset=0) {
  const root=55*Math.pow(2,(track%7)/12),notes=[0,7,12,16];
  return [0,1].map(channel=>Float32Array.from({length:frames},(_,i)=>{const at=i+offset,t=at/rate,beat=t*2,gate=beat%1,envelope=gate<.7?.45+.55*Math.exp(-gate*5):Math.exp(-(gate-.7)*15)*.45;let value=0;for(let n=0;n<notes.length;n++){const frequency=root*Math.pow(2,notes[n]/12)*(channel?1.0013:1);value+=(Math.sin(2*Math.PI*frequency*t+n*.17)+.17*Math.sin(2*Math.PI*frequency*3*t))*.018;}return value*envelope+(at%(4093+track*2)===0?.03:0);}));
}
function effectDefinitions() {
  return TYPES.flatMap(type=>[false,true].map(automated=>({id:type+'/'+(automated?'modulated':'static'),type,rate:48000,frames:8192,automated,patch:PATCHES[type]||{}}))).concat([44100,96000,192000].map(rate=>({id:'cupboard/multimic/'+rate,type:'cupboard',rate,frames:8192,automated:true,patch:PATCHES.cupboard})),['bluesdriver','screamer','rodent','fuzz'].flatMap(pedal=>['high','eco'].flatMap(quality=>[8000,48000].map(rate=>({id:'board/mono-circuit/'+pedal+'/'+quality+'/'+rate,type:'board',rate,frames:8192,scenario:'mono-circuit',patch:{quality,pedal1Type:pedal,pedal1Drive:.4,pedal1Level:-6}})))),[8000,48000,192000].map(rate=>({id:'cupboard/stereo-history/'+rate,type:'cupboard',rate,frames:Math.ceil(rate*.35),scenario:'stereo-history',patch:{...PATCHES.cupboard,stereo:'mono'}})));
}
function automationKey(r,type) {const key=AUTOMATE[type];if(typeof r.E.specifications[type]?.[key]?.[0]==='number')return key;return Object.keys(r.E.specifications[type]).find(key=>typeof r.E.specifications[type][key][0]==='number'&&!['mix','output','input'].includes(key));}
function effectRun(r,item) {
  if(item.scenario==='mono-circuit')return boardRun(r,item);
  if(item.scenario==='stereo-history')return cabinetHistoryRun(r,item);
  const effect=r.E.create(item.type,item.rate,item.patch),audio=polySignal(item.frames,item.rate,2),key=automationKey(r,item.type),spec=r.E.specifications[item.type][key];
  for(let at=0;at<item.frames;at+=item.automated?32:128){const count=Math.min(item.frames-at,item.automated?32:128);
    if(item.automated){const fraction=.5+.12*Math.sin(at/1301),patch={[key]:spec[0]+(spec[1]-spec[0])*fraction};if(item.type==='cupboard')Object.assign(patch,{mic1X:.7*Math.sin(at/2107),mic2Distance:.18+.05*Math.sin(at/1907),mic3Angle:35*Math.sin(at/2309),mic4Pan:.6*Math.sin(at/3019),output:-6+.7*Math.sin(at/2707),mix:.7+.1*Math.sin(at/4001)});effect.setParams(patch);if(at===4096)effect.reset();}
    effect.process(audio[0].subarray(at,at+count),audio[1].subarray(at,at+count),{tempo:120,beat:at/item.rate*2,playing:true});
  }
  for(const channel of audio)assert(channel.every(Number.isFinite),item.id+' finite PCM');
  return {pcm:pcm(audio),audio,effect};
}
function boardRun(r,item) {
  const effect=r.E.create('board',item.rate,item.patch),audio=polySignal(item.frames,item.rate,2),right=audio[1].slice();
  audio[1].set(audio[0]);audio[0][1001]=0;audio[1][1001]=-0;audio[1][3073]+=.00001;audio[1].set(right.subarray(4001),4001);
  const events=[{at:257,patch:{pedal1Drive:.71}},{at:513,patch:{pedal1Tone:.23}},{at:1024,patch:{pedal1Volume:.67}},{at:1537,patch:{quality:item.patch.quality==='high'?'eco':'high'}},{at:2049,patch:{input:6,output:-6}},{at:4501,patch:{pedal1Drive:.19,pedal1Tone:.83}},{at:5003,patch:{bypass:true}},{at:5507,patch:{bypass:false}},{at:5903,reset:true},{at:7001,patch:{quality:item.patch.quality,pedal1Drive:.53}}];
  let at=0,block=0,event=0;
  while(at<item.frames){while(events[event]?.at===at){const edit=events[event++];if(edit.reset)effect.reset();else effect.setParams(edit.patch);}const end=Math.min(item.frames,at+[1,17,137,251][block++%4],events[event]?.at??Infinity);effect.process(audio[0].subarray(at,end),audio[1].subarray(at,end),{tempo:120,beat:at/item.rate*2,playing:true});at=end;}
  for(const channel of audio)assert(channel.every(Number.isFinite),item.id+' finite PCM');
  return {pcm:pcm(audio),audio,effect};
}
function cabinetHistoryRun(r,item) {
  const effect=r.E.create('cupboard',item.rate,item.patch),audio=polySignal(item.frames,item.rate,2),events=[{time:.03,patch:{stereo:'split'}},{time:.09,patch:{stereo:'mono'}},{time:.15,patch:{room:0,alignment:'aligned'}},{time:.19,patch:{bypass:true}},{time:.23,patch:{bypass:false,room:.2}},{time:.27,reset:true}].map(event=>({...event,at:Math.ceil(event.time*item.rate)}));
  let at=0,block=0,event=0;
  while(at<item.frames){while(events[event]?.at===at){const edit=events[event++];if(edit.reset)effect.reset();else effect.setParams(edit.patch);}const end=Math.min(item.frames,at+[1,17,137,251][block++%4],events[event]?.at??Infinity);effect.process(audio[0].subarray(at,end),audio[1].subarray(at,end),{tempo:120,beat:at/item.rate*2,playing:true});at=end;}
  for(const channel of audio)assert(channel.every(Number.isFinite),item.id+' finite PCM');
  return {pcm:pcm(audio),audio,effect};
}
function lane(target,from,to,effectType) {return {target,enabled:true,interpolation:'linear',points:[{beat:0,value:from},{beat:8,value:to}],...(effectType?{effectType}:{})};}
function fixture(r,name,rate=48000) {
  assert(CORE_CASES.includes(name),'Unknown fixture '+name);
  const state=r.S.defaultState(),assets={},tracks=Number(name.match(/-(\d+)/)?.[1]||4),mixed=name.startsWith('mixed')||name.startsWith('arrangement')||name.startsWith('state-edits'),cabinet=name.startsWith('cabinet'),modulated=name.endsWith('modulated');
  state.tempo=120;state.lengthBars=64;state.loopStart=0;state.loopEnd=256;state.loopEnabled=true;state.recording.punchEnd=256;
  for(const owner of [...state.tracks,...state.buses,...state.returns,state.master]){owner.effects.fill(null);owner.automation=[];owner.level=owner.id==='master'?.7:.35;owner.mute=false;owner.solo=false;if('pan'in owner)owner.pan=0;}
  for(const lfo of state.lfos){lfo.enabled=false;lfo.routes=[];}
  const insert=(type,patch={})=>r.S.effect({type,params:{...PATCHES[type],...patch}});
  state.tracks.forEach((track,index)=>{
    track.disabled=index>=tracks;track.instrumentLive=true;track.clips=[];track.sends=[0,0];track.sendPre=[false,false];track.output='master';track.pan=(index%5-2)*.15;
    track.eq={...track.eq,low:0,lowMid:0,highMid:0,high:0};
    if(index>=tracks)return;
    if(cabinet){track.effects[0]=insert('cupboard',{stereo:'mono',...(name==='cabinet-2'?{mic2Enabled:'off',mic3Enabled:'off',mic4Enabled:'off'}:{})});if(modulated){track.automation=[lane('fx:0:mic1X',-.6,.7,'cupboard'),lane('fx:0:mic2Distance',.1,.7,'cupboard')];}}
    else if(name.startsWith('light')){track.effects[0]=insert('prism');track.sends=[.09,.03];}
    else if(mixed){const types=['cupboard','velvet','preserve','broiler','cellar','sunday','saute','board','ferment','prism'];track.effects[0]=insert(types[index%types.length]);if(index%2===0)track.effects[1]=insert('prism');track.eq={...track.eq,low:1,lowMid:-1.3,highMid:.7,high:-.4};track.sends=[.09,.04];track.output=index%3===1?'bus-1':index%3===2?'bus-2':'master';}
  });
  if(mixed||name.startsWith('light')){state.returns[0].effects[0]=insert('vestige',{model:'room',mix:1});state.returns[1].effects[0]=insert('parallax',{mix:1});state.master.effects[0]=insert('velvet',{model:'bus-4k',ratio:2,threshold:-18,mix:.6});}
  if(mixed){state.buses[0].effects[0]=insert('prism');state.buses[1].effects[0]=insert('velvet',{model:'clean',colour:0});}
  if(modulated)Object.assign(state.lfos[0],{enabled:true,sync:false,rate:.7,routes:[{id:'perf-142-mic-level',ownerId:'track-1',target:'fx:0:mic3Level',effectType:'cupboard',enabled:true,amount:.13}]});
  if(name==='state-edits-4')state.tracks[0].automation=[lane('fx:0:mic1X',-.5,.6,'cupboard')];
  if(name.startsWith('arrangement'))state.tracks.slice(0,tracks).forEach((track,index)=>{const id='performance-142-'+index,source=polySignal(rate*2,rate,index);assets[id]={left:source[0],right:source[1],sampleRate:rate};track.instrumentLive=false;for(let at=0;at<32;at++)track.clips.push({id:id+'-'+at,name:'Polyphonic reference',type:'audio',assetId:id,start:at*4,length:4,sourceStart:0,sourceEnd:2,sourceOffset:0,rate:1,reverse:false,loop:true,gain:.7,fadeIn:0,fadeOut:0});});
  return {state,assets,tracks};
}
function configure(core,mode) {if(mode==='off')return;core.setDiagnostics({enabled:true,mode:mode==='after-disable'?'deep':mode});if(mode==='after-disable')core.setDiagnostics({enabled:false,release:true});}
function coreRun(r,name,{rate=48000,frames=8192,block=128,mode='off',realtime=false}={}) {
  const f=fixture(r,name,rate),core=new r.DSP.Core(f.state,f.assets,rate,{linear:true}),sources=f.state.tracks.map((_,i)=>polySignal(frames,rate,i)),audio=[new Float32Array(frames),new Float32Array(frames)];core.start(0);configure(core,mode);
  for(let at=0,index=0;at<frames;at+=block,index++){if(name==='state-edits-4'&&index>0&&index%7===0){const next=copy(core.state),phase=Math.floor(index/7)%3;next.tracks[0].level=.3+(index%3)*.03;next.tracks[0].effects[0].params.mic1X=(index%5-2)*.15;next.tracks[0].automation=phase===2?[]:[lane('fx:0:mic1X',-.5,.6,'cupboard')];Object.assign(next.lfos[0],{enabled:phase===1,sync:false,rate:.7,routes:phase===1?[{id:'perf-142-toggle-filter',ownerId:'track-2',target:'fx:0:threshold',effectType:'velvet',enabled:true,amount:.09}]:[]});core.setState(next);core.setState(copy(next));}const end=Math.min(at+block,frames),inputs=sources.map(pair=>pair.map(channel=>channel.subarray(at,end)));const render=realtime&&core.renderRealtime?core.renderRealtime:core.processBlock;render.call(core,audio[0].subarray(at,end),audio[1].subarray(at,end),inputs);}
  for(const channel of audio)assert(channel.every(Number.isFinite),name+' finite PCM');
  return {pcm:pcm(audio),audio,core};
}
function capture(r) {
  const effects=Object.fromEntries(effectDefinitions().map(item=>[item.id,effectRun(r,item).pcm]));
  const cores=Object.fromEntries(CORE_CASES.flatMap(name=>[128,137].map(block=>[name+'/'+block,coreRun(r,name,{block}).pcm])));
  return {baseline:BASELINE,definitionsSHA256:sha(JSON.stringify({effects:effectDefinitions(),cores:CORE_CASES,frames:8192})),scenarioSHA256:scenarioHash(),sourceHashes:r.sourceHashes,effects,cores};
}
function scenarioHash() {return sha(JSON.stringify([polySignal,effectRun,boardRun,cabinetHistoryRun,fixture,coreRun].map(fn=>fn.toString())));}
function exactChecks(r=load()) {
  assert(FROZEN&&FROZEN.baseline===BASELINE,'Capture immutable baseline before ordinary portable checks');
  assert.equal(sha(JSON.stringify({effects:effectDefinitions(),cores:CORE_CASES,frames:8192})),FROZEN.definitionsSHA256,'Frozen fixture definitions must remain fixed');
  assert.equal(scenarioHash(),FROZEN.scenarioSHA256,'Frozen signal, edits and routing scenario logic must remain fixed');
  let count=0;
  for(const item of effectDefinitions()){assert.equal(effectRun(r,item).pcm,FROZEN.effects[item.id],item.id+' exact 1.42 stereo PCM');count++;}
  for(const name of CORE_CASES)for(const block of [128,137])for(const mode of ['off','after-disable','light'])for(const realtime of [false,true]){assert.equal(coreRun(r,name,{block,mode,realtime}).pcm,FROZEN.cores[name+'/'+block],name+'/'+block+'/'+mode+'/'+(realtime?'realtime':'default')+' exact 1.42 stereo PCM');count++;}
  return {baseline:BASELINE,effectCases:effectDefinitions().length,coreCases:count-effectDefinitions().length,checks:count,sourceHashes:r.sourceHashes};
}
function callCounts(ref='working',names=['dry-2','light-4','mixed-4','cabinet-4','cabinet-4-modulated'],{blocks=32,mode='off'}={}) {
  const r=load(ref,true),rows=[];
  for(const name of names){const f=fixture(r,name),core=new r.DSP.Core(f.state,f.assets,48000,{linear:true}),sources=f.state.tracks.map((_,i)=>polySignal(128,48000,i)),output=[new Float32Array(128),new Float32Array(128)];core.start(0);configure(core,mode);core.processBlock(output[0],output[1],sources);r.clear();for(let block=0;block<blocks;block++)core.processBlock(output[0],output[1],sources);rows.push({fixture:name,blocks,mode,metrics:{...r.metrics}});}
  return {ref,sourceHashes:r.sourceHashes,rows};
}
function structuralChecks() {
  const rows=[];
  for(const mode of ['off','after-disable'])for(const row of callCounts('working',['dry-2','light-4','cabinet-4'],{mode}).rows){for(const key of ['performance.now','Core._syncDiagnosticsTopology','Core.beginDiagnostics','Core.endDiagnostics','Core.diagnosticsStart','Core.diagnosticsEnd','Core.getDiagnostics','JSON.stringify','JSON.parse','new Float32Array','new Float64Array','new Uint8Array','new Int32Array',...TYPES.flatMap(type=>[type+'.setParams',type+'.getMeters'])])assert.equal(row.metrics[key]||0,0,row.fixture+'/'+mode+' steady audio path: '+key);rows.push(row);}
  const r=load('working',true),item={id:'settled-cupboard',type:'cupboard',rate:48000,frames:8192,patch:PATCHES.cupboard},fx=effectRun(r,item).effect,input=polySignal(4096),builds=fx.getMeters().kernelBuilds;
  r.clear();fx.process(input[0],input[1],{tempo:120,beat:1,playing:true});const settled={...r.metrics};
  assert.equal(fx.getMeters().kernelBuilds,builds,'Steady microphone processing cannot redesign the body response');
  for(const key of ['Math.sin','Math.cos','Math.tan','Math.exp','Math.pow','Object.keys','Object.entries','Object.assign','new Float32Array','new Float64Array'])assert.equal(settled[key]||0,0,'Settled cabinet cannot repeatedly redesign coefficients or allocate: '+key);
  rows.push({fixture:'settled-cupboard',frames:4096,metrics:settled});
  const disabled=fixture(r,'dry-2');disabled.state.tracks.slice(2).forEach(track=>{track.effects[0]=r.S.effect({type:'board',params:{}});track.effects[1]=r.S.effect({type:'cupboard',params:PATCHES.cupboard});});
  const core=new r.DSP.Core(disabled.state,{},48000,{linear:true}),sources=disabled.state.tracks.map((_,index)=>polySignal(128,48000,index)),output=[new Float32Array(128),new Float32Array(128)];core.start(0);core.processBlock(output[0],output[1],sources);r.clear();for(let block=0;block<16;block++)core.processBlock(output[0],output[1],sources);
  assert.equal(r.metrics['board.process']||0,0,'Disabled tracks cannot render a retained pedal rack');assert.equal(r.metrics['cupboard.process']||0,0,'Disabled tracks cannot render a retained cabinet rack');
  rows.push({fixture:'disabled-heavy-racks',blocks:16,metrics:{...r.metrics}});
  rows.push(realtimeSnapshotChecks());
  return rows;
}
function realtimeSnapshotChecks() {
  const r=load(),reports=[];
  assert.equal(typeof r.DSP.Core.prototype.renderRealtime,'function','Production hosts expose the allocation-saving render path');
  for(const details of [undefined,null,{ownerId:'track-1',slot:0}])for(const freeze of [false,true]){
    const f=fixture(r,'mixed-4'),options={linear:true,...(freeze?{freezeCaptureTrackId:'track-1'}:{})},normal=new r.DSP.Core(copy(f.state),{},48000,options),live=new r.DSP.Core(copy(f.state),{},48000,options),sources=f.state.tracks.map((_,index)=>polySignal(128*20,48000,index)),expected=[new Float32Array(128),new Float32Array(128)],actual=[new Float32Array(128),new Float32Array(128)],held=[];
    normal.start(0);live.start(0);live.setMeterDetail(details);
    for(let block=0;block<20;block++){
      for(const core of [normal,live]){if(block===4)core.stop();if(block===6)core.start(.3);if(block===8)core.panic();if(block===10)core.start(0);}
      const inputs=sources.map(pair=>pair.map(channel=>channel.subarray(block*128,(block+1)*128)));
      normal.processBlock(expected[0],expected[1],inputs);live.renderRealtime(actual[0],actual[1],inputs);
      assert.equal(pcm(actual),pcm(expected),'Realtime/default PCM agrees through stop/panic/freeze at block '+block);
      for(const snapshot of held)assert.equal(JSON.stringify(snapshot.value),snapshot.encoded,'A retained getMeters result cannot mutate on a later realtime block');
      if(block===1||block===7){const value=live.getMeters();held.push({value,encoded:JSON.stringify(value)});const inserts=[...value.effects.flat(),...value.returnEffects.flat(),...value.busEffects.flat(),...value.masterEffects].filter(Boolean);if(details===null)assert.equal(inserts.length,0,'Closed panels omit effect detail snapshots');else if(details)assert.equal(inserts.length,1,'Selected panel reports exactly its own insert');else assert(inserts.length>0,'Direct Core full detail remains available');}
    }
    reports.push({details:details===undefined?'full':details?'selected':'none',freezeCapture:freeze,blocks:20});
  }
  return {fixture:'realtime-snapshot-stability',cases:reports};
}
function distribution(values,budgetMs) {
  const sorted=Array.from(values).sort((a,b)=>a-b),percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]||0;let misses=0,streak=0,longest=0,overrunMs=0;
  for(const value of values){if(value>budgetMs){misses++;streak++;longest=Math.max(longest,streak);overrunMs+=value-budgetMs;}else streak=0;}
  return {samples:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:sorted.at(-1)||0,deadlineMs:budgetMs,overDeadline:misses,overDeadlinePercent:misses/values.length*100,longestConsecutiveMisses:longest,totalOverrunMs:overrunMs,milliseconds:Array.from(values)};
}
function timingHarness(r,name,{rate=48000,mode='off'}={}) {
  const f=fixture(r,name,rate),core=new r.DSP.Core(f.state,f.assets,rate,{linear:false}),ringFrames=128*64,sources=f.state.tracks.map((_,index)=>polySignal(ringFrames,rate,index)),inputs=Array.from({length:64},(_,block)=>sources.map(pair=>pair.map(channel=>channel.subarray(block*128,(block+1)*128)))),output=[new Float32Array(128),new Float32Array(128)];let block=0;core.start(0);configure(core,mode);
  core.setMeterDetail?.(null);const render=core.renderRealtime||core.processBlock;
  return {core,state:f.state,step(){render.call(core,output[0],output[1],inputs[block++%inputs.length]);},transport(){structuredClone(core.getMeters());if(mode!=='off'&&mode!=='after-disable'&&core.diagnosticsReportDue())structuredClone(core.getDiagnostics());}};
}
async function benchmark({refs=[BASELINE,'working'],fixtures=['dry-2','light-4','mixed-4','mixed-10','cabinet-4-modulated'],modes=['off'],blocks=1024,warmup=512,trials=3,rate=48000,transport=true}={}) {
  const releases=refs.map(ref=>load(ref)),results=[],gc=[];
  const collect=entries=>{for(const item of entries)gc.push({startMs:item.startTime,durationMs:item.duration,kind:item.detail?.kind??null});};
  const observer=new PerformanceObserver(list=>collect(list.getEntries()));observer.observe({entryTypes:['gc']});
  try {
    for(let trial=0;trial<trials;trial++)for(let ni=0;ni<fixtures.length;ni++)for(const mode of modes){
      const name=fixtures[(ni+trial)%fixtures.length];
      for(let ri=0;ri<releases.length;ri++){
        const release=releases[(ri+trial)%releases.length],h=timingHarness(release,name,{rate,mode});
        for(let block=0;block<warmup;block++){h.step();if(transport&&block%8===0)h.transport();}
        const callbackMs=new Float64Array(blocks),cycleMs=new Float64Array(blocks),startMs=performance.now(),cpuStart=process.cpuUsage();
        for(let block=0;block<blocks;block++){
          const start=performance.now();h.step();const audioEnd=performance.now();callbackMs[block]=audioEnd-start;
          if(transport&&block%8===0)h.transport();cycleMs[block]=performance.now()-start;
        }
        const cpu=process.cpuUsage(cpuStart),endMs=performance.now(),cpuMs=(cpu.user+cpu.system)/1000;
        await new Promise(resolve=>setImmediate(resolve));
        results.push({fixture:name,tracks:h.state.tracks.filter(track=>!track.disabled).length,ref:release.ref,mode,trial,rate,blocks,warmup,transport,startMs,endMs,callback:distribution(callbackMs,128/rate*1000),callbackAndMessages:distribution(cycleMs,128/rate*1000),cpuMs,wallMs:endMs-startMs,cpuBudgetPercent:cpuMs/(blocks*128/rate*1000)*100,sourceHashes:release.sourceHashes});
      }
    }
    // GC notifications may arrive after the immediate following a synchronous
    // measured run. Flush delivery and associate all events retrospectively;
    // deciding overlap inside that first immediate can falsely report zero.
    await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));collect(observer.takeRecords());
    for(const row of results){const events=gc.filter(entry=>entry.startMs<row.endMs&&entry.startMs+entry.durationMs>row.startMs);row.gc={count:events.length,totalMs:events.reduce((sum,event)=>sum+event.durationMs,0),maxMs:Math.max(0,...events.map(event=>event.durationMs)),events};}
  } finally {observer.disconnect();}
  return {baseline:BASELINE,results,gcCollection:{supported:PerformanceObserver.supportedEntryTypes.includes('gc'),totalEvents:gc.length,deferredFlush:true},limitations:['Informational synchronous Node measurements; reserve the CPU. Individual callback wall durations include OS/JIT/GC pauses, retained as outliers.','Callback deadline is 128 frames / sample rate. Total process CPU is separate from per-callback wall deadlines.','Setup, source generation, warm-up and Core construction are excluded. Versions and fixture order rotate across trials.','Transport snapshots run at 128*8 frames; callbackAndMessages includes their preparation and structuredClone, not real browser messaging.','Four-note input chords are pre-rendered. Actual hosted instrument, UI and browser thread contention require browser measurements.','GC events come from Node PerformanceObserver and may include unrelated process work overlapping the observation window.']};
}
async function main() {
  const arg=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];},list=(name,fallback)=>arg(name,fallback).split(',').filter(Boolean),number=(name,fallback)=>{const value=Number(arg(name,fallback));assert(Number.isSafeInteger(value)&&value>0,'Positive integer '+name);return value;};let report;
  if(process.argv.includes('--record-baseline')){report=capture(load(BASELINE));const marker=/\/\* FROZEN-BEGIN \*\/[\s\S]*?\/\* FROZEN-END \*\//;fs.writeFileSync(__filename,fs.readFileSync(__filename,'utf8').replace(marker,'/* FROZEN-BEGIN */ '+JSON.stringify(report,null,2)+' /* FROZEN-END */'));console.log('Recorded immutable 1.42 capture: '+Object.keys(report.effects).length+' effect and '+Object.keys(report.cores).length+' Core hashes.');}
  else if(process.argv.includes('--bench')){report=await benchmark({refs:list('--refs',BASELINE+',working'),fixtures:list('--fixtures','dry-2,light-4,mixed-4,mixed-10,cabinet-4-modulated'),modes:list('--modes','off'),blocks:number('--blocks',1024),warmup:number('--warmup',512),trials:number('--trials',3),rate:number('--rate',48000),transport:!process.argv.includes('--no-transport')});console.table(report.results.map(row=>({fixture:row.fixture,ref:row.ref.slice(0,8),mode:row.mode,trial:row.trial,cpuPercent:row.cpuBudgetPercent.toFixed(1),p95Ms:row.callback.p95Ms.toFixed(3),p99Ms:row.callback.p99Ms.toFixed(3),maxMs:row.callback.maxMs.toFixed(3),misses:row.callback.overDeadline,gc:row.gc.count})));}
  else if(process.argv.includes('--calls')){report=callCounts(arg('--ref','working'),list('--fixtures','dry-2,light-4,mixed-4,cabinet-4,cabinet-4-modulated'),{blocks:number('--blocks',32),mode:arg('--mode','off')});console.log(JSON.stringify(report,null,2));}
  else {report={audio:exactChecks(),structure:structuralChecks()};console.log('PASS '+report.audio.checks+' exact immutable 1.42 PCM checks and '+report.structure.length+' deterministic closed-profiler/steady-path guards.');}
  if(process.env.GALLEY_142_REPORT)fs.writeFileSync(process.env.GALLEY_142_REPORT,JSON.stringify(report,null,2)+'\n');
  return report;
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={BASELINE,TYPES,CORE_CASES,FILES,load,polySignal,effectDefinitions,effectRun,fixture,coreRun,capture,exactChecks,callCounts,structuralChecks,distribution,timingHarness,benchmark};
