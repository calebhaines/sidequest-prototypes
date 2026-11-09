'use strict';
/* Pre-CUPBOARD regression capture. --record-baseline reads ONLY immutable Git
 * sources at f15f91c; normal checks are portable and never rewrite fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const historicalCore = require('./group-bus-legacy-checks.cjs');
const BASELINE = 'f15f91c53cd7aad4417001572cf3eddbc72f1686';
const TYPES = ['prism','velvet','cinder','undertow','parallax','vestige','halo','tremor','broiler','glaze','scales','strainer','swirl','crumble','saute','preserve','tinpan','ferment','sunday','cellar','board'];
const CATALOGS = ['vocal','utility','filter','creative','preamp','tape','char','lofi','pedal-synth','deluxe','svt','guitar-pedals'];
const PROCESSORS = ['vocal-dsp','utility-dsp','filter-dsp','creative-dsp','broiler-pedals','compressor-dsp','preamp-dsp','tape-dsp','char-dsp','lofi-dsp','pedal-synth-tracker','pedal-midi-dsp','pedal-synth-dsp','deluxe-dsp','svt-dsp','guitar-pedals-dsp','hood-dsp','effects','service-schema','lfo','schema','cpu-profiler','track-eq-dsp','mastering-dsp','audio-engine'];
const FACTORIES = ['Vocal','Utility','Filter','Creative','BroilerPedals','Compressor','Preamp','Tape','Char','LoFi','PedalSynth','PedalTracker','Deluxe','PedalMidi','SVT','GuitarPedals','Hood'];
const FILES = ['shared/pattern-schema.js',...CATALOGS.map(name=>'loom/'+name+'-catalog.js'),'loom/effects-catalog.js',...PROCESSORS.map(name=>'loom/'+name+'.js')];
const GOLDENS = /* FROZEN-BEGIN */ {
  "effects": {
    "prism/8000": {
      "pcm": "7b947c0d82ed3428f3498c600f940b475395a67d4991e088d3ad015dd8f8d507",
      "meters": "65466e4ceff1f36a6bf18e06200610383148353f3c0c012b2b37be2e33d29c45"
    },
    "velvet/8000": {
      "pcm": "63aba642b8ca134e3d516b4c6d2cadd661499b5347956c41076e35878c380841",
      "meters": "2beba389c9a81a063d4f964d87e641a5bdf16970be71a2584a0db984802f8b26"
    },
    "cinder/8000": {
      "pcm": "c1a8ab8fdda0c87054ccb975c3742c96530b438fb9595aad4b1250aab11aa5fa",
      "meters": "1ac687ac2684dec2b9ee666f221618e327287e90ec70f40b292dd59f76dddc87"
    },
    "undertow/8000": {
      "pcm": "6e579ad3fd68d0b9afb4d362155b71c789d415569b190b81ce927c8f168a5c97",
      "meters": "54fb52d93292e7a8573be1f82cb11b34b98acf7393a62512cc73ac4ace14f662"
    },
    "parallax/8000": {
      "pcm": "617202d990f5d3709ca3d9167eed76d61ea5dde4fb091c997541da2f82e5b652",
      "meters": "11f0f921705a927cdc3f50c521e8091364e4cbb21202430d183f6397c62a28fb"
    },
    "vestige/8000": {
      "pcm": "4a918805f2ba9810d4f2282661b45137b8a219defa4b68282edffee657693395",
      "meters": "e56684a916eaa1a81150d62dfbef730c3b2c462631f7b397d34cc354a05241a9"
    },
    "halo/8000": {
      "pcm": "03bc08297ab578bfa40c4297f8823f6beea8fa6d86b207aea8aabc742692d5f8",
      "meters": "c4bdad392dbf1580bf793f1328deea0b1eccbadc7d056cc2b1a448311003bea5"
    },
    "tremor/8000": {
      "pcm": "f5dfe1789c2862ec68e3e67817ed1aaa638d16267da770c47fabdb2f6d4a65be",
      "meters": "27ad02685276e23c93f94290629395aeac07df46d608c4efe2cd5d176c518cc3"
    },
    "broiler/8000": {
      "pcm": "c4a68731fc4093452f6364d759ff4c013421c6ce77b43bacca288c81e7187afd",
      "meters": "830fbac6951acb2e926c90efb64dd56efa795785436cecfe132e9fd72c6236c1"
    },
    "glaze/8000": {
      "pcm": "3d3f8627df9df1d35eebf194723dfa5b75f9c2e48f46b2cba83c7309acca4e03",
      "meters": "14bdae944dd9af742eef8de352e4ae90cbc934103bbec3a36704dade36facdff"
    },
    "scales/8000": {
      "pcm": "b2ed632cc153b93b7f3dea67a2e2486865536f10df06b783c2ddd80390c8d9fd",
      "meters": "cc59d3413a6c1f7476e6bbab6c3e89a57ce4c64ea60b10315695829e4dfe45cc"
    },
    "strainer/8000": {
      "pcm": "fdac583760592188ca51bce04a22d8fe517aa322ced641401f3b375b010ec78c",
      "meters": "b83c3d23d8ecf3c5e96d5b8677dce33edbff21e6386076aa0e4a7a40c3f65d0a"
    },
    "swirl/8000": {
      "pcm": "9507e352b9365dba591965e240ebd57435b8b6153390dcb802d36e316d3f3b6f",
      "meters": "11e67d40e3fe54b9a414ac9adbd13d98844849ab74f17fd5b56f8a9d4cc73ffb"
    },
    "crumble/8000": {
      "pcm": "599497d7dc414f2e862f48d10a717a2f45a168d57969aec96aafe1cc330fa528",
      "meters": "ef047af8d517a803af45bc9440fc32a4f72fae0d2fdf7c03de96f561f6d6cc95"
    },
    "saute/8000": {
      "pcm": "dcfc75ae8bae815de3b699952d57561d300a1f3618510457069e6d8ef0838409",
      "meters": "5d841958df92e4c47ef4b808f3d631664dab9c4f6ad056173eb56457a61ff7a6"
    },
    "preserve/8000": {
      "pcm": "75d07539936be2abf000db0f9d1d69f3a9b007b6874e441196f20bf93e9f705c",
      "meters": "8505d00af8a94d5370b4e00dd504028e9750b90eb850d25d21eede1936d7dbda"
    },
    "tinpan/8000": {
      "pcm": "16ce914c3f2f4e046bbcc72afe3f1fb22c5b67893fe56d26ed8db1e29fb956f6",
      "meters": "58e6a87b8b71b2998c7f4f195e3e982fa118356eedf3db62e1985b507918c5be"
    },
    "ferment/8000": {
      "pcm": "4e4c9fee974680689c8271124e042d061c2f6080307204120f8db209da21749c",
      "meters": "ee4f171a88c7441587838b6dd8e1f6db7c7b7d92c13de1ce521f96067dad25c2"
    },
    "sunday/8000": {
      "pcm": "c9c7624a1a9f86f75e19bb0dd6acf0a53908d698f10a4c26bc43f2716ab0fa53",
      "meters": "f8ce37277c662f189da00843f47c2810010dfafad05db8f612dad322686fbb65"
    },
    "cellar/8000": {
      "pcm": "386972ebc839d7643f694f0fd0e59cd5ca05d7f4104b413c47dd53bc80429bb5",
      "meters": "77d495e967ecc71468b20d0aaa0135e5eecf98a1785197fa82113d922639bf07"
    },
    "board/8000": {
      "pcm": "1fe18099aca367294a5c277f21960104286959a7adff1b9f87bcc80fbf1277e3",
      "meters": "14c66ec0774c6b88f067a720207dbda9c1d687293986f75fca822939331013e6"
    },
    "hood-room/8000": {
      "pcm": "0e823779baff26d3f64300daccf6196248feb5501503bcd23d3d2ed2f6223b1d",
      "meters": "23a5544cac0d5cdc99573218345660707f7046317b0469934fdb95f8039875e4"
    },
    "hood-chamber/8000": {
      "pcm": "61fb7e52f23e981bda717e62b576efabebc379a512845007266c0894b36c3f89",
      "meters": "769b370524c58d91a9c98380d7d9f289584139ab9cdc2798e8afa8e96556a252"
    },
    "hood-hall/8000": {
      "pcm": "1d42b47fe55ae685517faebcccee179ae22b46f68b71244c8a5b7a9455445563",
      "meters": "4a1ca8d1b60821952182608ce4a972b3ad236336e26725d0776c547b06f1bf25"
    },
    "hood-cathedral/8000": {
      "pcm": "8ecc24af0c46a04c057f7eddec150e4cdc6615dcf6eb00d2fab85c9c06b07158",
      "meters": "b24eb1bcef4f95ceb9be8ea8b43ebadd806453ca01ab66aaf5d9cc9c802d7904"
    },
    "hood-plate/8000": {
      "pcm": "f55d277ed0dcd52a054372cdc26a84b4c41a6da75466a40a49ebf864e5ae895e",
      "meters": "2ea4db6e5a4e1abbf5b87c3e2a7262649754df2a958607f194363f9ceb5d31a4"
    },
    "hood-spring/8000": {
      "pcm": "9af062ea4642c714c40fb93af792399d7ca165e8068393ae70bcd0558f63be0c",
      "meters": "126406f28f83ddb71857bfe518d714a0729f6cd4da4affd1164063422bfc19d6"
    },
    "hood-tile/8000": {
      "pcm": "e3e6e4f822d4f20db15293206132275bdd8f0a02333ad3e47b956cad62b38e17",
      "meters": "e64af9525f2417fe9da70c3fe3d06bb3b5b9b70bb02788a0521b8cf1a4dbba8c"
    },
    "hood-ambience/8000": {
      "pcm": "25079f5784d032e444336cc995f239a47f28728561992843839ff8fabd065c39",
      "meters": "31d1f46bb0cb3be2218ea13ef26065f92b4ab786956251f6551bb7747f31389c"
    },
    "hood-digital/8000": {
      "pcm": "7d4e67341045b5fcb211100b5d47443a15862667cc4b2716661936c07d4e7e1e",
      "meters": "5ac5263d81313dcb3cdb2e8432df65b0d9a588fdc62bed94b76c3f44cf3bdfea"
    },
    "hood-modulated/8000": {
      "pcm": "83997e43796563051628f8ccf16b4ffd36bfaecd79aae01011087dfd1e40e316",
      "meters": "7f169d416c926dfee618d63106fe0f97aba9bb9c38780c5089b4882e4400ebb2"
    },
    "hood-shimmer/8000": {
      "pcm": "82f23cc651eae011bc8aa81bbc8e461020a8d84002e4383e370f3a36e8ee0270",
      "meters": "52e7100cbf1bf8be37f31fbf2f35270d561725614f847c6c00a9d01a2335c691"
    },
    "hood-gated/8000": {
      "pcm": "2ddfc290f291e16da681df4dd4daa1ce7e0968dfd6eda4c23c53f90d0dfb703d",
      "meters": "e3af84fab08b3b53f90e319e99ab78d581163b21a648aa4d501412b6fe91e583"
    },
    "hood-reverse/8000": {
      "pcm": "faec7862b85cf71f0188835b0c1d07cac25ee9d05a533afe7cbda5d3d2f913da",
      "meters": "804c36da2f1ca51de27e2f04053325da012067cdd8ff86e0ff068e5608bee61c"
    },
    "hood-bloom/8000": {
      "pcm": "468b387b0ec9c1cb687c98a5382798e7ca94d4040dd065d52406edddca7c8e5d",
      "meters": "c02ede5f4fe912e2affaa1c61a9e0deb07ba6a593dd6f27b7aa389416f7f97c9"
    },
    "hood-nonlinear/8000": {
      "pcm": "2c93577efd5a3d00ce3b11dd1ca31afe52430d90a81f024633dbe4939a33fcc8",
      "meters": "c083b631c31303f4b31511b6de682c2a8b289634b7fd206f4e653b8e8ebb78fa"
    },
    "prism/48000": {
      "pcm": "214d7c2a751af712526a33238d4c8188cbac27f88d6b82031fac7d4cc3e08e92",
      "meters": "65466e4ceff1f36a6bf18e06200610383148353f3c0c012b2b37be2e33d29c45"
    },
    "velvet/48000": {
      "pcm": "f4337aa04c7562a90d032bd51808ddc5260071192ab3f8464f932382ec15d05b",
      "meters": "5ab6358a1455c3615090f958c57b1157e5eaf27087bf4e3b3e39010bba20b8bc"
    },
    "cinder/48000": {
      "pcm": "3487dc7f898ca65c88b7b1130a81996a7dedca7b6a6b6cb41ae08d59287bf74c",
      "meters": "1ac687ac2684dec2b9ee666f221618e327287e90ec70f40b292dd59f76dddc87"
    },
    "undertow/48000": {
      "pcm": "5590ccc60430caaed050ca40c251a5bf7f2ef42288313a9ece1ef3c190224f37",
      "meters": "54fb52d93292e7a8573be1f82cb11b34b98acf7393a62512cc73ac4ace14f662"
    },
    "parallax/48000": {
      "pcm": "1d9f8f8d1c9d7f86ffa9cc908922915b5dbab5310f63f1585098f6fec1478119",
      "meters": "11f0f921705a927cdc3f50c521e8091364e4cbb21202430d183f6397c62a28fb"
    },
    "vestige/48000": {
      "pcm": "02ff400b682ed66fdb606b5f96e1812e984fe6cd24632c36ee4f6647ed3a2103",
      "meters": "e56684a916eaa1a81150d62dfbef730c3b2c462631f7b397d34cc354a05241a9"
    },
    "halo/48000": {
      "pcm": "7c84bde68a2aa79f4d431dcd463cdd40344c74f5b88888179a6a926a242136d9",
      "meters": "c4bdad392dbf1580bf793f1328deea0b1eccbadc7d056cc2b1a448311003bea5"
    },
    "tremor/48000": {
      "pcm": "ac467897d4950e868b1c7f969c0b7b6b6e90b2e361b3037fb1cdbb56f7aff97f",
      "meters": "27ad02685276e23c93f94290629395aeac07df46d608c4efe2cd5d176c518cc3"
    },
    "broiler/48000": {
      "pcm": "6f9fe7322807671f9e9039aeac27f6d9581e84495ce0ab1713773f4c4a08e2e1",
      "meters": "2247a5c596f676d03e840530e79ee1d4fea6f29ac98313c6b6a278dc467633fa"
    },
    "glaze/48000": {
      "pcm": "f29ae6b636d9fca6e5e8b41ebcb958e60f3f2942b04c73b3e9704631db0d72ee",
      "meters": "b3d6dcd0732a5d351dcb696f09cc82cf950f361591461a35b28802ba477e2203"
    },
    "scales/48000": {
      "pcm": "e4bc922763045921d6d1aad86b4824faad976156c0cba666920af309c767b0bc",
      "meters": "d9771545fa9b5ba737727aea425cca64a2f12b076ffe4b053b190baf02cdc7f0"
    },
    "strainer/48000": {
      "pcm": "5f1a3c23a16d6abec4a692cc27e8cc63464830fd25f20f1d62b7172378057c39",
      "meters": "eb4c3c235e2c01b73a9575d8290dcb25a8d08acbc4129be408e5e958470dda6c"
    },
    "swirl/48000": {
      "pcm": "e0b221b1d64e614509a3a074420982e1bcb6286d62d6261262c353caf1efa87d",
      "meters": "838dda5735c2ed9351ad6902c5526e701eb13a67b25f1e28101e7bbacd9a5d1f"
    },
    "crumble/48000": {
      "pcm": "ad23c7165ba4d3cc5907798421255bbf1302f07ac1a0d289ffa50a241ff1fe89",
      "meters": "43f51f0728d1bbbfdac09a8bcf54db189949aa1217cead1655a8a0edf5e44729"
    },
    "saute/48000": {
      "pcm": "283fcd2a08ef83dccc63df735b7a3c282f03354b9928188f7803669ef3dc912d",
      "meters": "c7e9ce86eb1d1f50a25dcaca511de42b1b712ef643a3036bfd28c4e2d7a3e9cf"
    },
    "preserve/48000": {
      "pcm": "e55609b91795b0d687b37d1b26f6621a34ef5424f716422facdb23a3a0f03c00",
      "meters": "06d98d37ef3e9d0c0197c7bd3885f39ed16aea908fa2ca246edb47ede44b4db4"
    },
    "tinpan/48000": {
      "pcm": "7d49171d84e9645d8c5e916ac8aba9e9078fffe381f181fd45a2595c83a22f16",
      "meters": "b2c25b9b1c833515af670db57dd7dd8dcd1ab6d6cfe0cd0e465954e0540da0b3"
    },
    "ferment/48000": {
      "pcm": "1e4394133df148fe1112305fcb7e1299a25d03391464e70a2e3705c3b970f9bc",
      "meters": "449aa84fbe58389707d51fd85874eb78219d68ec09cf58d96fc5b6838e932cd5"
    },
    "sunday/48000": {
      "pcm": "7d512b97f2e32e08db008dda2c6dc1c922fdfd8aed66a5815c04ca38d2038fbe",
      "meters": "13f4d831c5bf1e2c9bfd3f5e07a466e5cb05af634d878ac267026a49212b47ef"
    },
    "cellar/48000": {
      "pcm": "127fa32f18d4b8c3793c10375695c3339e48f7425e62a73e58b42e87498786f7",
      "meters": "8969e839bdeff518fa4115ccf93158b68b2ba3fd351498aa9772a1c229d911d2"
    },
    "board/48000": {
      "pcm": "b990d760eec6b707f8dea4de20e442ee6e3eb05d222268bc63647389590b561f",
      "meters": "db3da9db787db7cf9008c66eb4b836af4d3f3dfeafb9efcb4c40961f815aff01"
    },
    "hood-room/48000": {
      "pcm": "bc8f30a4d098dfa73ee8025f9fafdeda9e04dbe9d6ec5149bc8336c6dcd6a938",
      "meters": "8e25fc208ba9a8423c30c58c0cf6da0c9301118594f99483dc6796d8705933ce"
    },
    "hood-chamber/48000": {
      "pcm": "f010b7cb9936b85421b9a74534cfc420232a4d0b573bf2e9a48ccbbe44b75272",
      "meters": "4a31cd8c708a6a0e07738437ba79a237eb19377666ab4975c3830572798e79c2"
    },
    "hood-hall/48000": {
      "pcm": "eb6cb23cbeb16357f8a677f19955ebc02bba5739102d98ff9bf5836ae350d052",
      "meters": "5ca4fc9bd7b25ee3ed6104e46884ccad04b9a89925d35550d51bf1580f93d2c3"
    },
    "hood-cathedral/48000": {
      "pcm": "8ef8c7e23c62ec23f0d9c0dde23d78704d55cb01987ec5543f79598e9b443845",
      "meters": "08002f7c8d16696a65bb7d185f6f6e0f6cd21146ad28cf8b2896988cbb8ab7ab"
    },
    "hood-plate/48000": {
      "pcm": "3763ae6ba46c98f780d9e2d3c1e693be510a6e802d515b96a25384e1be3d4bab",
      "meters": "a8fba0937dd3a702aa60127a40e3e379dbdc9501907370290be2e4dfab69a1b8"
    },
    "hood-spring/48000": {
      "pcm": "f2f56ecb05d4af13fe67c45a10bf5aad388ff04285663e9e1e12058b99a79470",
      "meters": "c339cd53e210a2078dbbc107615be15071f3e6669126c1d05521bae4f2d968e0"
    },
    "hood-tile/48000": {
      "pcm": "71874ea790ade57fcf72d115dbe1988f791f3a4c4cf68ee2a0476e33cf9b5140",
      "meters": "056f57b7c5525d69df8f76d2e1ea60649163a992955979e0767791faa2a3b0ca"
    },
    "hood-ambience/48000": {
      "pcm": "d9f00963a2079070408fd666f516a630605b48501e9c8097ae2e3ef6f603206c",
      "meters": "d615c11b9bc4484caf151fe9d0e214d6aba6ea035132f7ddf3a0d66011dd1451"
    },
    "hood-digital/48000": {
      "pcm": "52061287db6fab73118a096fd62f99d036be02cd481f9e040f797db54a7bca71",
      "meters": "896efcefe1d23982014872a410fb55a27515ce8c9dfdea2b0e8b423062fc54ac"
    },
    "hood-modulated/48000": {
      "pcm": "090761bd99888e50ee6ffa5248acf28b9430aba014a4a5e381f2bfb864d04202",
      "meters": "b1338eac4bd7ce92b2b8dd862b9e7b140bdd5496506f66d3892f0ab2c363928b"
    },
    "hood-shimmer/48000": {
      "pcm": "532c25caeedd875099698dae4b306388eff668d9558e00ac81f2b8910ec27f5f",
      "meters": "f7f7d793ff0b94ab689db242246dede4a7c08632f1b3f2be9c62fea3eb59a511"
    },
    "hood-gated/48000": {
      "pcm": "68f1c8cdbe32211511f9da82699c0166a30147f23de93a4e4d0d338bd46b1d2c",
      "meters": "a083d32651264c2f551efd146a3a030cfca9b52edf583ca384a3308a6afeff32"
    },
    "hood-reverse/48000": {
      "pcm": "785656eb1123ee2b896fb2406df594f9add8361a73e31a9f980e3284ff795521",
      "meters": "f0c02413065266161d7ff7fdc452ad9a466f8e52bc9e0c6f8efec0e160510ae0"
    },
    "hood-bloom/48000": {
      "pcm": "fe172be64fe2098de0c31f59cd8ac138ef340ba1534f32f8dfb9eee3ae2c3195",
      "meters": "09f633ec49cb16c4836398a6721d0beeeea5cd27a3521edf05611800655d94f6"
    },
    "hood-nonlinear/48000": {
      "pcm": "a4bc36137dd7e85c5f8d14b9c9398a6183f3bb371733cf0fad3db0213ed43b8c",
      "meters": "0241749ccc2dd8c50e7f79ae3c5f8591d9a9eb656f78eb8e33bc9cddcbf6d536"
    }
  },
  "cores": {
    "plain/8000/128": {
      "pcm": "95dbe86ce36329e19c3ed8afe46d171788a0f62b0843a18acadadc8c1ecbfb56",
      "meters": "84ae1263f06f374cf944b53fd8d30bdb2e7a0e8ca3cabfc2088276c91d381597"
    },
    "rich/8000/128": {
      "pcm": "eff9565fc1767b97924a76d0a57298c9efd42caa59e6d159a17ec10297db139c",
      "meters": "2f51cb2efc74070e7e2f3d2fcab79ebbd61d4c2f2002b4158713fe696649e0be"
    },
    "changes/8000/128": {
      "pcm": "f3a8e5cc942fd366cba475a55b6fe8093919878197740b780bcdb62d400ba8b0",
      "meters": "6de24c337fba89b5bf21e10b55888a759bc67b3252de4684806c88f969d719f3"
    },
    "return-solo/8000/128": {
      "pcm": "6c821b143db85401575a92eeed84dea9eab7d2381f0967ff1865cbe3fc78cc3a",
      "meters": "eb5a2df297b0c2f77b7cd9e511b71a42925b468f36c62400763df48def9a2120"
    },
    "disabled/8000/128": {
      "pcm": "a980053c0c40be3c57af17a442d1995531cd47b50d843d6d0d5133a0a1241d50",
      "meters": "1eeed4b582a32c0e3a2e3cbc2b64f57b637a6025e3585ceb8c3f8ce6dbfefb34"
    },
    "clips/8000/128": {
      "pcm": "a49b6a5489e146c5f2dc22df330950448cbc596c8bdd5e8a372ee9c40010fa4c",
      "meters": "5583ac07cab403b0b7f0101c6f0fde7a3ab9ddc507a8219054fd4884fe363f14"
    },
    "grouped/8000/128": {
      "pcm": "a49c5c01f86c5231d1d6a3292626a80e9cc2d90de44435d6d898602f3479de41",
      "meters": "852f4a69d911a5b293326d868ac117f96ffb70cba44323b9c80a507eeccb44f8"
    },
    "plain/8000/137": {
      "pcm": "95dbe86ce36329e19c3ed8afe46d171788a0f62b0843a18acadadc8c1ecbfb56",
      "meters": "6664854977df1b70a851a1d1b9b8e10efe63601ee01fa007315d1aff8dda6445"
    },
    "rich/8000/137": {
      "pcm": "eff9565fc1767b97924a76d0a57298c9efd42caa59e6d159a17ec10297db139c",
      "meters": "69db2503cae3aef8e23d1cab1b5b803db1852ce7629ee646800f681a9419d4ba"
    },
    "changes/8000/137": {
      "pcm": "f3a8e5cc942fd366cba475a55b6fe8093919878197740b780bcdb62d400ba8b0",
      "meters": "2d57b118ffa0f9e71391d6cbe5bc86f37e4ba0312b6cac6957b1cefd4f6bcd43"
    },
    "return-solo/8000/137": {
      "pcm": "6c821b143db85401575a92eeed84dea9eab7d2381f0967ff1865cbe3fc78cc3a",
      "meters": "c739f8707cc30be7b3fa70d68a6db27bd8dbb2d5cc5e3673ef2505fdd8fb2810"
    },
    "disabled/8000/137": {
      "pcm": "a980053c0c40be3c57af17a442d1995531cd47b50d843d6d0d5133a0a1241d50",
      "meters": "0abeea357c2f29885d9f248c5c438889b4f70175bcfa1dcdf9882c167e69e6e9"
    },
    "clips/8000/137": {
      "pcm": "a49b6a5489e146c5f2dc22df330950448cbc596c8bdd5e8a372ee9c40010fa4c",
      "meters": "4bbdbdee958ea57ee623ac22f47d1ed75a6e313b5dabf43220bd11a41ded5d6e"
    },
    "grouped/8000/137": {
      "pcm": "a49c5c01f86c5231d1d6a3292626a80e9cc2d90de44435d6d898602f3479de41",
      "meters": "4848a65e28484e13503d0cc4efc7f2c27b51925b39c8889ced00fdc47c702a4e"
    },
    "plain/48000/128": {
      "pcm": "e419cbb9a14a27e579a06aef8a561b063262950d6d35a9532f362410e1e35373",
      "meters": "75c6aecb03dff804473d37630d3913c95f5932f614ea3b6e255c7632dc3d9b84"
    },
    "rich/48000/128": {
      "pcm": "4f5fd388ac84bf13703fdefd0071415fd230f916285e624ba6a6140b13d733c2",
      "meters": "24601fd174be0b55e1e24fd6c955f732ffb765728e93a5efa778beceff359bef"
    },
    "changes/48000/128": {
      "pcm": "80dfb1d6443a78c5df2f9cfe2adaa2ab64c404cbbe6ab896fb291cb2a9885924",
      "meters": "f605c1449288a93fb2b2b3a428dd12833fe83d29a20c46f5f032f673cb6ebe23"
    },
    "return-solo/48000/128": {
      "pcm": "edfbde952a326082e7b74a57311e7a1af31144532423a77e06be19c1ca018e1c",
      "meters": "f491777a57bdfa6e34f854fb5b5fa05cd62d2b0ae6dbae06c3391a5a915bc35f"
    },
    "disabled/48000/128": {
      "pcm": "a57cc01698ec9589cccfad279b619a87f593aa92e044bc7773c37ea70159b85a",
      "meters": "2fed396819b1c761cb40ca55576b7284601934949e94ca1a68fa937212c92f00"
    },
    "clips/48000/128": {
      "pcm": "ce02a5d08c4fc831719bfaddccbd5fed39558a663df17728bc20a34b5fbbb4b6",
      "meters": "ba60731c31669dfa243d4cb995a333ed0a3b3a34dd060f653918fd60e29de1c5"
    },
    "grouped/48000/128": {
      "pcm": "af89cbf811fa1eb00f4738c19294fdbd1003b1bd846350d045442e84f23f23bb",
      "meters": "ffdbd2353774856f09071e96e0ed8f19476d7cf12816663878d895bdadba927b"
    },
    "plain/48000/137": {
      "pcm": "e419cbb9a14a27e579a06aef8a561b063262950d6d35a9532f362410e1e35373",
      "meters": "8b7f1c9a4e4c1f6e68d3a8c001f96560ecc2824b000dc0b7a6e1c97aba7f90af"
    },
    "rich/48000/137": {
      "pcm": "4f5fd388ac84bf13703fdefd0071415fd230f916285e624ba6a6140b13d733c2",
      "meters": "94edfdc8ebee16c22ab4b09f2f90c9886278eebec9c6f271ad2716e886233c1e"
    },
    "changes/48000/137": {
      "pcm": "80dfb1d6443a78c5df2f9cfe2adaa2ab64c404cbbe6ab896fb291cb2a9885924",
      "meters": "024138bf79c09f04ec8aab0d4db0cb08b0eaa7e4846b0457b79b65f9d7470610"
    },
    "return-solo/48000/137": {
      "pcm": "edfbde952a326082e7b74a57311e7a1af31144532423a77e06be19c1ca018e1c",
      "meters": "8925c9580776b10959d83c471bd179c375b231526e094016ee59cb428e5f6369"
    },
    "disabled/48000/137": {
      "pcm": "a57cc01698ec9589cccfad279b619a87f593aa92e044bc7773c37ea70159b85a",
      "meters": "c00d8ce4f72919736c9aedd7f9fe2bf406992e9c1a8367777a94bedb51e7a52a"
    },
    "clips/48000/137": {
      "pcm": "ce02a5d08c4fc831719bfaddccbd5fed39558a663df17728bc20a34b5fbbb4b6",
      "meters": "6d8471f1c9c4fa03c33bb9bca1c390ee155e129a9d6b52d4892c73b1395a5a63"
    },
    "grouped/48000/137": {
      "pcm": "af89cbf811fa1eb00f4738c19294fdbd1003b1bd846350d045442e84f23f23bb",
      "meters": "e670a7014deb7ccab736023a9679d5ae467d92725f2b351e63cad3b5890049fd"
    }
  }
} /* FROZEN-END */;
const copy = value => JSON.parse(JSON.stringify(value));
const hash = channels => { const result=createHash('sha256'); for(const channel of channels) result.update(Buffer.from(channel.buffer,channel.byteOffset,channel.byteLength)); return result.digest('hex'); };
function localFile(file) { return file.startsWith('loom/') ? path.join(__dirname,file.slice(5)) : fs.existsSync(path.join(__dirname,file)) ? path.join(__dirname,file) : path.join(__dirname,'..',file); }
function load(released=false) {
  const scope={ console,performance,Date,crypto:webcrypto,Blob,AbortController,setTimeout,clearTimeout,TextEncoder,TextDecoder,structuredClone };
  scope.window=scope;scope.globalThis=scope;scope.atob=text=>Buffer.from(text,'base64').toString('binary');scope.btoa=text=>Buffer.from(text,'binary').toString('base64');
  const files=FILES.flatMap(file=>!released&&file==='loom/effects-catalog.js'&&fs.existsSync(localFile('loom/cabinet-catalog.js'))?['loom/cabinet-catalog.js',file]:!released&&file==='loom/effects.js'&&fs.existsSync(localFile('loom/cabinet-dsp.js'))?['loom/cabinet-dsp.js',file]:[file]);
  for(const file of files){const source=released?execFileSync('git',['show',BASELINE+':'+file],{cwd:path.join(__dirname,'..'),maxBuffer:8*1024**2}).toString():fs.readFileSync(localFile(file),'utf8');Function('window','globalThis','crypto','atob','btoa',source)(scope,scope,scope.crypto,scope.atob,scope.btoa);}
  const E=scope.createLoomEffectsDSP(),DSP=scope.createLoomEngineDSP(scope.createLoomEffectsDSP,scope.createLoomLFODSP,scope.createLoomCPUProfiler,scope.createLoomTrackEQDSP,scope.createLoomMasteringDSP);
  return {scope,E,S:scope.LoomSchema,DSP};
}
function signal(frames,rate,channel=0){return Float32Array.from({length:frames},(_,i)=>{let value=Math.imul(i+17,1103515245)^Math.imul(channel+3,-1640531535);value^=value>>>16;return .05*((value>>>0)/4294967296*2-1)+.09*Math.sin(2*Math.PI*(channel?227:137)*i/rate);});}
function effectCases(r){return [8000,48000].flatMap(rate=>[...TYPES.map(type=>({type,rate,patch:{},id:type+'/'+rate})),...r.E.specifications.vestige.model.filter(model=>model!=='original').map(model=>({type:'vestige',rate,patch:{model,decay:.7,predelay:7},id:'hood-'+model+'/'+rate}))]);}
function effect(r,item){const frames=4099,p=r.E.normalize(item.type,item.patch),fx=r.E.create(item.type,item.rate,p),definition=r.scope.LoomEffectsCatalog.find(def=>def.id===item.type),parameter=definition.params.find(param=>param.type==='range'&&!['mix','output'].includes(param.key)),key=parameter.key,value=parameter.min+(parameter.max-parameter.min)*.41;
  const events=[{at:17,patch:{mix:.71}},{at:257,patch:{bypass:true}},{at:511,patch:{bypass:false}},{at:977,patch:{[key]:value}},{at:1577,reset:true},{at:1801,patch:{mix:.43}}],left=signal(frames,item.rate),right=signal(frames,item.rate,1),meters=createHash('sha256');let event=0,block=0;
  for(let at=0;at<frames;){while(events[event]?.at===at){const change=events[event++];if(change.patch)fx.setParams(change.patch);if(change.reset)fx.reset();}const end=Math.min(frames,at+[1,31,137,251][block++%4],events[event]?.at??Infinity);fx.process(left.subarray(at,end),right.subarray(at,end),{tempo:123,beat:at/item.rate*2.05,playing:true});meters.update(JSON.stringify({at:end,meters:fx.getMeters(),tail:fx.getTailTime()}));at=end;}
  assert(left.every(Number.isFinite)&&right.every(Number.isFinite),item.id+' finite old effect output');return {pcm:hash([left,right]),meters:meters.digest('hex')};
}
function groupCore(r,rate,block,mode){const s=r.S.defaultState(),frames=4099;s.tempo=120;s.lengthBars=1;s.loopEnabled=false;s.recording.punchEnd=4;
  for(const owner of [...s.tracks,...s.returns,s.master,...s.buses]){owner.effects.fill(null);owner.automation=[];owner.level=owner.id==='master'?.73:.7;owner.mute=false;if('pan'in owner)owner.pan=0;}
  s.tracks.forEach((track,index)=>{track.instrumentLive=true;track.output=index%3===0?'master':index%3===1?'bus-1':'bus-2';track.sends=[.11,.07];track.sendPre=[index%2===0,false];track.effects[0]=r.S.effect({type:index%2?'prism':'cinder',params:{mix:.27}});});
  s.buses[0].effects[0]=r.S.effect({type:'vestige',params:{model:'shimmer',decay:.5,mix:.2}});s.buses[1].effects[0]=r.S.effect({type:'cellar',params:{cabinet:'di',mix:.3}});s.returns[0].effects[0]=r.S.effect({type:'parallax',params:{clock:'free',time:23,mix:1}});s.master.effects[0]=r.S.effect({type:'velvet',params:{mix:.4}});
  Object.assign(s.lfos[0],{enabled:true,sync:false,rate:.7,routes:[{id:'cabinet-legacy-bus-pan',ownerId:'bus-1',target:'pan',enabled:true,amount:.3}]});
  const core=new r.DSP.Core(s,{},rate,{linear:true}),sources=s.tracks.map((_,i)=>[signal(frames,rate,i),signal(frames,rate,i+10)]),out=[new Float32Array(frames),new Float32Array(frames)];core.start();if(mode!=='off'){core.setDiagnostics({enabled:true,mode:'light'});if(mode==='released')core.setDiagnostics({enabled:false,release:true});}
  for(let at=0;at<frames;at+=block){const end=Math.min(frames,at+block);core.processBlock(out[0].subarray(at,end),out[1].subarray(at,end),sources.map(pair=>pair.map(channel=>channel.subarray(at,end))));}
  const meter=core.getMeters(),retained={beat:meter.beat,playing:meter.playing,tracks:meter.tracks,returns:meter.returns,buses:meter.buses,master:meter.master,effects:meter.effects,returnEffects:meter.returnEffects,busEffects:meter.busEffects,masterEffects:meter.masterEffects};return {pcm:hash(out),meters:createHash('sha256').update(JSON.stringify(retained)).digest('hex')};
}
function run(){const record=process.argv.includes('--record-baseline'),r=load(record),captured={effects:{},cores:{}},result=[];
  for(const item of effectCases(r)){const value=effect(r,item);if(record)captured.effects[item.id]=value;else{assert.deepEqual(value,GOLDENS.effects[item.id],item.id+' preserves released PCM/meters/tails');result.push(item.id);}}
  for(const rate of [8000,48000])for(const block of [128,137])for(const name of ['plain','rich','changes','return-solo','disabled','clips','grouped']){const key=name+'/'+rate+'/'+block,modes=record?['off']:['off','light','released'];for(const mode of modes){const value=name==='grouped'?groupCore(r,rate,block,mode):historicalCore.render(r,name,rate,block,mode);if(record)captured.cores[key]=value;else{assert.deepEqual(value,GOLDENS.cores[key],key+'/'+mode+' preserves released Core PCM and meters');result.push(key+'/'+mode);}}}
  if(record){const source=fs.readFileSync(__filename,'utf8').replace(/\/\* FROZEN-BEGIN \*\/[\s\S]*?\/\* FROZEN-END \*\//,'/* FROZEN-BEGIN */ '+JSON.stringify(captured,null,2)+' /* FROZEN-END */');fs.writeFileSync(__filename,source);console.log('Recorded immutable '+Object.keys(captured.effects).length+' effects and '+Object.keys(captured.cores).length+' Core cases from '+BASELINE);return;}
  const old=r.scope.createLoomEffectsDSP(...FACTORIES.map(name=>r.scope['createLoom'+name+'DSP']));for(const item of effectCases(r))assert.deepEqual(effect({...r,E:old},item),GOLDENS.effects[item.id],item.id+' old17-argument factory signature');
  const report={baseline:BASELINE,effectCases:Object.keys(GOLDENS.effects).length,coreCases:Object.keys(GOLDENS.cores).length,checks:result.length,oldSignatureCases:effectCases(r).length};if(process.env.CABINET_LEGACY_REPORT)fs.writeFileSync(process.env.CABINET_LEGACY_REPORT,JSON.stringify(report,null,2)+'\n');console.log('PASS CUPBOARD leaves every prior effect and Core route unchanged',JSON.stringify(report));return report;
}
if(require.main===module){try{run();}catch(error){console.error(error.stack||error);process.exitCode=1;}}
module.exports={BASELINE,load,effectCases,effect,groupCore,run};
