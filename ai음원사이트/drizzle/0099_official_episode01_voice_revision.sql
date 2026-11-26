-- Keep the existing public edition, share URL, credits, social activity and recording identities.
-- The staging performance stays private. Its immutable audio objects have already been rendered.
CREATE VIEW episode01_revision_jobs AS
SELECT p.id AS public_id, s.id AS stage_id, j.id AS public_job, k.id AS stage_job,
       j.manifest_json AS old_manifest, k.manifest_json AS stage_manifest,
       j.output_key AS old_output, k.output_key AS new_output,
       j.output_meta AS old_meta, k.output_meta AS new_meta, j.updated AS old_updated,
       p.owner_id AS owner, p.script_json AS script, p.script_key AS public_script, s.script_key AS stage_script
FROM dubbing_projects p
JOIN dubbing_projects s ON s.id='c86de6bd-1ac6-45ec-96d3-b361b366591a'
JOIN dubbing_projects root ON root.id='512fb824-036c-452a-b603-c883b0619a29'
JOIN dubbing_final_jobs j ON j.project_id=p.id AND j.script_key=p.script_key
JOIN dubbing_final_jobs k ON k.project_id=s.id AND k.script_key=s.script_key
JOIN dubbing_sound_jobs old_bg ON old_bg.project_id=p.id AND old_bg.script_key=p.script_key AND old_bg.state='ready'
JOIN dubbing_sound_jobs new_bg ON new_bg.project_id=s.id AND new_bg.script_key=s.script_key AND new_bg.state='ready'
WHERE p.id='b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899'
 AND p.root_id=root.id AND s.root_id=root.id AND p.owner_id='de9247b5-de49-458b-b048-da61f9b5f75b'
 AND p.owner_id=s.owner_id AND root.owner_id=p.owner_id AND p.deleted_at=0 AND s.deleted_at=0 AND root.deleted_at=0
 AND p.source='performance' AND s.source='performance' AND p.visibility='public' AND s.visibility='private'
 AND p.state='complete' AND s.state='complete' AND j.state='ready' AND k.state='ready'
 AND p.script_json=s.script_json AND p.script_json=root.script_json AND p.role_count=2 AND s.role_count=2
 AND json_array_length(p.script_json,'$.lines')=92 AND json_array_length(j.manifest_json,'$.lines')=92
 AND json_array_length(k.manifest_json,'$.lines')=92 AND old_bg.timeline_json=new_bg.timeline_json
 AND json_extract(j.manifest_json,'$.background')=old_bg.output_key AND json_extract(k.manifest_json,'$.background')=new_bg.output_key
 AND json_extract(j.manifest_json,'$.duration')=json_extract(k.manifest_json,'$.duration')
 AND json_valid(j.output_meta) AND json_valid(k.output_meta)
 AND json_extract(k.output_meta,'$.sampleRate')=48000 AND abs(json_extract(k.output_meta,'$.duration')-json_extract(j.manifest_json,'$.duration'))<0.1
 AND instr(j.output_key,'dubbing/'||p.owner_id||'/'||p.id||'/final/'||j.id||'-')=1
 AND instr(k.output_key,'dubbing/'||s.owner_id||'/'||s.id||'/final/'||k.id||'-')=1
 AND (SELECT count(*) FROM dubbing_role_claims WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recordings WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recording_lines l JOIN dubbing_recordings r ON l.recording_id=r.id WHERE r.project_id IN (p.id,s.id))=184;
--> statement-breakpoint
CREATE VIEW episode01_revision_lines AS
WITH verified_hashes(line_id,old_hash,new_hash) AS (VALUES
 ('line_001','c970b0ce6166b39d70d77093302ac09f18da451d1f758a43b7579da03c6fbd63','6e221731da360a0b3824b190eb86ddf8bd201897e8e9c30ac2207df604928a3c'),
 ('line_002','76e94ca2451c88bd6030b29fb4cdceccd94bfd4e0d272fa858cf7526659a3589','c26b4530c0a041a0d61f7e7e5ea251c0104f56a2d48cdf19cfe6a549902d5836'),
 ('line_003','5c903674fb2c4915e14562e564d6e96f31f3b8e85621fde186b52e8ee7f5d5dc','164e16be687e5fc09ddac15174bd34d3877f3ba2aab87a0273eaa7e98d58dc74'),
 ('line_004','6043d91ed6b2db1e1138cc1677163ab37db3cec476844497ba53e97e0044bce8','85b15be4193cd1aa83841649f0e93e18836b1d09fe9bcdf4a213069a23e086e0'),
 ('line_005','579b0ef597f11a26fed597edd66e813dc3e7580a931e380d9f0961239351bad4','d900f1b5d4a4c785e608ec89ef09c6013d98ae37536c7b7b9a5fd64e929242b4'),
 ('line_006','55fb0e5e935008b477da0ad63f441c03da0477e8331ebc211624cca95f5fec34','687a32f2b66d3721577339372a30d58a3226cba7e0944119107406a7d2910d0f'),
 ('line_007','e6104fee199f056e49fe204ad88ed2ec989e2a278ab242b0655c09df9fe5b632','ec83bcb4d5a62c12701d0075b20119892fbbc69bc28cd53dd806be2ade76dac4'),
 ('line_008','b931d84c672690a60976fa3acff48d061e1d1e4489e426187394e2281973117a','96e3c23aa7edaf87e6264f256b7192c9374ad012c29093b20f2d5ac18e154854'),
 ('line_009','8ba28d0b3de6599314acce657832daddc787e074e7986163195e1f63d138f571','d81c9c832345c73c9e014882c0c0a024937a6d4c36be6195c50bb210150fbd8f'),
 ('line_010','44f4b7b8318a77140693850f3c32b46dd55bbf86a4c83aa0e759516ee32be506','42cc269ede6a19a1207d9fd429464f7da829d31d9efa90e2e3ce08cb726a1eca'),
 ('line_011','c8e5596631bbd09cea84845311f3afd9756e29921119a6ccd7bbd3848bbdb6d4','844d38557ca8b78b7e9e64d17a4fef371541a933e3771999b1299f3d409eb4db'),
 ('line_012','89f6aeee211af819530992d13fb50c9c8c0300e400f976ea220cb2fcfb016586','d0730326f82569f63000eb413f83e621c72489708f3bf706461f90fd3c6174e4'),
 ('line_013','29cfab9a410a36a0a79244e49cce2e904a48458c9a494895a73a845fd0ab622f','6d94cd5b8a8db1370d71bea54767ae473b2934823007107657b36a7a5ed15b1f'),
 ('line_014','ebe6187dae4e74953e9e75438c649d48c47760294c62bf88e3830d9ee013a8df','cd4f2139f1ce6b702be997ebefd348fa56f948a09a90d3106796ce8c4bd52b87'),
 ('line_015','8d812ca22f23ce144429df85504858f420e04d71b1a8309888cfd7438d61d94e','fe9713b7bbf71c007330cfc58c2e7c0d1c8ec8b98f1f13421c92abb297d02dea'),
 ('line_016','6f2db6ff37cc2c15d3b42dfd7b78e95d89f51e91d36984a6b74c7bb434f0d6d8','05242d86c381b5142ef0eb71136ecbf86f740be5689af8d387e2fe8ab8e1fcae'),
 ('line_017','b2d2f4558ae6e8f0669cd10de5f46024c558380f27026fe015b79e7c10d40f82','f2406d68fa05127c25b0a8821a46251999b6ee99c8de80be2632652d6ec8a3f2'),
 ('line_018','1edced4988e0b60c6326c793bfeb6e1a084b941f6d92cb4891d730ddd6e3d972','afe972bb47b2d8b6233b536f81e933db2f7a1cabbd617873039a6435af3a33ea'),
 ('line_019','76f32116fbc06766e75bf5247d2311f575b4ead9526f1d4ba7a0e07defdb39b7','f3526e8738a99c0815f8158159bc0a62d81e19eab4012b49fcab2310835dd476'),
 ('line_020','fdf53019cde536f7c0806b0cd4dd70958af428a5c5d78903a144056603f4106f','551c5362d3a46b8b04c7c9d6eb0d5b75df57244ee67d2c1b6c5cc03412b342e3'),
 ('line_021','8f75ac5f021e24800e121d818d5172c9290e3cca6afd906a70cf1888f3b461e8','a78dfc23dc8bfe5c421f953686de05eb92f9e404f533308334b634e7c55ab69c'),
 ('line_022','04b11095c4cfe07c77ec1235dcd0454c5eb77894943f1ae935bf64fc31ee808a','ad16e85d90c1028b62310aa9d956904950e397614af81d520baeba3d6a923e2d'),
 ('line_023','2ecc8dc90201f89e5bba349ed117e431345281115ed90542ed7f49fb02c0ad78','13f6b3ca2de365e44b42eaeeb5f0829b9e601b525317e9a70c3d31df77b23b46'),
 ('line_024','473ee7e3ffbd196337b854d67db0ccacc5a6b65bf7ff6719b5a1d08788c7d0cf','c94e474f26a0157e190d7f4b8a639ebb5d805c778b4a74a091e0f806a3e0fd05'),
 ('line_025','e4e2891d80e23346c3c026f97f015cdc406295228bac4e8e5163752c1a6de337','cd711d8383906a958d15b748ca1a4aa17a2bf87873c5108bce2e520afdbfcdf8'),
 ('line_026','79ff82d0246f2c104f83d997158fc9bb5d134616ebe96f317661694992ea7601','4c8621f4c89a8375bf78d1137634d6149f33fd40168af5bf6a1448dc62d56f9f'),
 ('line_027','27a0156240f1b6d7323b7b904f2e08190e546b4aa188f11b737ed90db55e0c75','94499a7df84b804e7b91b2f6b5219b51814d51f14e7a0cb942f66b9d01c5734a'),
 ('line_028','bad11a842368f307ac1980d6e5e4ebc484d3915890f4c8bfea3500e7abdb8ffc','6910a7ef37000d90036d88fb83facadddb86a6552eab8144f08db4a5bbc37771'),
 ('line_029','81af37c934185c671ed8cce2a54fcdb55955dca8fc9a3615e61ea343125ecf6e','c4115431ea52018e4f9bb4ea0a1710100750d7f3680b165e687a82eafd87400f'),
 ('line_030','6db05f5362435e8bd135f476100b664227b82242bfd60b037cad5d7ff33267c4','3340173c07990e4c6e42f38d29050ab09420a9f121563249fa0cad573ff12d94'),
 ('line_031','9ed0659d051d50a83a80060cd7aaf38a17d84bfc9845773a0bc47aa9dadb17cb','e14c217fbdb9eaabc17cce283ae7ad9128df022b752a1bd7f16ccd0a27d8d717'),
 ('line_032','782ccde51b7858995a536801c32aee2db604a6d2c12200a9a4986fe77c4e44e0','2d8cc76d600a57c24f9b7117fc4f3ff423d59df0e4e81c3c79ed3799d3e3dcd0'),
 ('line_033','ff8e02b7992e79b69f97e29768a33a685fe8e9bdc71aaf2f0e531aa32d5dd455','0b312ff587cb4d8f37ffcd4895cd7b015a69069b29d20b893cb2595febdecf16'),
 ('line_034','d91a3bcf256200c49fa1184a1254c3484c8a31069b4a7b35438aa6596e077ab5','2a7b97bf364af65f6f66062eaeadf7fc27ff77796f38d8778530f2e7f914445c'),
 ('line_035','95ab4b32886fdc04818fc81892991c3aa5d2335990cd49e0ed50b13864a48a11','da46c17bbe1fcddbd296801f6ab7d5a2ac4487392a5866a7e86d5192429afd30'),
 ('line_036','62a30cfdc437c2b2c47674909973a5e719959aad2c5dd8ea6db698a456a72d82','aa08a57b9a61ea79c62d88bb66ab4f0ef637ed51dcd1de6f853dc549813fa0a3'),
 ('line_037','39005bd6a94608a20ac18e12744b7650a6aafbecf798f88fe74003de599f3241','98328c5567d66dbef39fa3fd425449503cf92dcd5da30262ad6901dee6fee123'),
 ('line_038','873cde3aeb4349167157e7e27d3bb8176c7ad2fd6e564df30fadf78b3dfe8a3f','138b492378d4bb37bb1d4e0cd3134cbdd6b3b68e28ad31044331097cf83c19f7'),
 ('line_039','e4753483c9825bdbf87cf1f3f3350bd923dd6ba304c37f5aeaca1b02d8a736dc','cad23d99429e2b375fd82ac4b4ca61f4cb071e2a44ac6ec147cf056d31ecc12e'),
 ('line_040','25561f43cf5c51c7305b3fcef96e0f6f14e0cd5875591a9ffe0a48e6eaa63768','10ba4c13411ad257ec5cdf2629520dccb7d9287bd94f9248786d60d59d988bf0'),
 ('line_041','e431bb179fa8270b90e375d27df581eb7bdcda88160c3e45facd68d7d813205d','245102382023e8e1086ddae8439babf0bf911ea1a545450176e7a243650074a2'),
 ('line_042','96b15d92f2fc4977ec583e423b5dccfafb1bd4bf123a338bde0a3db14809698a','9f924f0814912587c5439c17d61b8fa811da6f7a3062d0d2ea6157cafcd5ba18'),
 ('line_043','37d9607ceab294315df6806d94041ec6ff244db04b58949fef045d0f8d430dde','acaea866b9d75b5c02ad9c6cd22187849d4374e87fdb603cb0e981f91c2a0362'),
 ('line_044','892f1ee070c8be024f52675e2fd08b486a1aaec517bcc993a4055ab7a4b67498','e1ed9fe5b77e1216b1f4076ef8798e78e9c1897447a42478631b7fc21d2d2c55'),
 ('line_045','ffaf497d2a030ce6fcc167c22724845d13a1fb56837ecc2f756413ff67052a2e','c6f301f0556cc6d7b1bbac4ac5e037b787e6330296a69b92ce363b00afaf8165'),
 ('line_046','50585406d073028206bac9c7d52c04a48f918c07b04294c46f6ac9fb234ec86f','035d4b44fff071bfd81906526b415e90bf868e302f4b3d3839e378f003e356b0'),
 ('line_047','c5af07e870bd52a1edf4aa7b19d13b6b304fc7efa22ea6f05c4405d12e254c46','889f495e2b3d9c03ec66a902c7a902b110d8254f9d1e3df600284ad269ffe146'),
 ('line_048','fa56ef282f764429fbbf09605356c5797861b57f1d2884f9c355c7bb48703504','4ab6ddde05b4ee9ed53c86129c37652186bace3153953a6c4b9cd5fc3bda9a84'),
 ('line_049','77961d54413255b8699c3d513fe13ce94e5b8316f51f716b8b4a4e870adf6c43','25526059b8f2601b6ba513e1b0aab5f10464f227ebfd7c2752ebe47065262f7a'),
 ('line_050','26c6dc706390f2beaa3156aea0d4364082f70cc032117502eca2cdc2dd48fe20','6d63160636d58d84ef72383e69598e534c93a4fa41c75851e0138b1ba08d67e0'),
 ('line_051','ae8909d134d560ca3451d81991faa77850873c00f8c0be8965c8faffcb408eb3','04e25c07d8766f33e26bbd843ceed74d00f7e78126205a1eea0caa8b701f4762'),
 ('line_052','71a3ff311ddb624e5a7225a27bdaa11e650c8587f9123ca0a9483125199b7228','1860c1fe2ecaf5501b79fd74e50913412391aa382e646aa1b9a85c51ae673ca8'),
 ('line_053','8b0e58906ed21898f4511fe479150a6c08e199f5f4cf9a65c24e4b89c38f41ea','487a36d14c787187048792699fef8864ce38ca5b30259d8b7149b12838c6b80b'),
 ('line_054','c193852d0466d23a57f224ae0440ff4868cbc9af4992790e211e97eb8a82a685','d146d92c6ded6caee06752d8ea14d832cc8cae294373176fa71464646af2b2f9'),
 ('line_055','ca211ba29302a154073848428ac99ae6e80d3e2655f0e62411735b31a7d69624','9e9a213c4367020d3b56c3995cc2e65fa1aa1a227f470e7cf015b53ecb1a4a24'),
 ('line_056','1396baf72bed04ae7bd61ba4389aafbcb831e9d66801fd5da5df4b532b9b705d','caf64c372d26126aeeb98dda97c4fd95fe79c90172b4615ec84fc649086ae8d3'),
 ('line_057','d2800b1d5ea994c40ddce57ff2b570e18c679ab0772db4af8fb131874a6af81f','5b2cf1c43b1022cde649a461bc35d64ae41e35af0e376f8fb503eb282cef0430'),
 ('line_058','0be6a62d54018d0806028996d12dab3cc741f9e1ce1023283d3338e288ef1949','ce84da7fd50d0e0ccdc3a7edb415dc5918a3c89b65603441f5f481ad34b1bfb1'),
 ('line_059','74bf391ddfed6b51f741b0df60cb464ea92ae635ecd9c85361b178a0aed8b795','1dc179c7248ea1ec0834b024d2bb01a3fda1f3d4128c28151417071f31f42ee7'),
 ('line_060','9a69640c043dba777a58d3b44cb87ee602f66190bb84fedb3bc639e40d40eb75','e3a6924a8be2e8ec3a2ea9b1292bc51595bccca66b6604c1bf598218751952c1'),
 ('line_061','debafdfc4b995dd27efe8cb5e84efbd06bedad63f56eb55ad3aa9b7592ea5ebd','414103ac06653998f1c9f1df8084a8d2d9c59cae57de7de0522ad00cf5d39e5c'),
 ('line_062','62ff88f3cb25eba503eef27b7a294c5cafe42f90c39cfbc38b69d92dfccbf428','8ec18611f2b0b6ae2600114a75437a880df4c1039bf65968836bbff182fe701f'),
 ('line_063','9a796d82e8d705c762a98e71af712d614ec180beee5f5eece9101949ac5efd64','003cb6d841ee5f10513ec295ee6824cb4d11761859b4d4dd1f7708a2c71696c8'),
 ('line_064','624d89580afe209fdeeba8e598a88c20bdb181dce5f4541adba076e121aea22e','f230ad6739472a71caa0734452632a98a873b6fc75d9e18194619d85b2ddbcf0'),
 ('line_065','57dc35921e3d02fa6ee5e8ff6a11a09cfdee8b9de8bfe3685e9fc07f73b020b3','d2e98026ccb65e9e1b76dbc234c726f32e05a8cac16fe47d5bf837ad2af5d9ba'),
 ('line_066','5dacc7ca2d69b369cd63271535abf48688db444023d9e1e5255f16e4eec4d357','4aed941088a4f2d0e2e0d1476c07eb802534501444f25bfe03ef16891be206fa'),
 ('line_067','76d91d31ff35a0927585152921fbeaf1136755075e98e07c277789a6e1b64f7a','62be4089683c70f82b5f4d2400f69994eff7dcf43fa726fab45ae491fc2da38f'),
 ('line_068','1ae837c9ce2414bf85e81b4aedd4974d855269f9d6ef0730ef4657fdab5e732b','14f2c1988ef42b7d7d46da5d63d6e8c324b31c7f3dc6ea3d453a3ddd2bcdf3c7'),
 ('line_069','ec0931d3cc59be5869ddca261f26b4a93a92371eaff497a24d8c3d1b4a315aaf','c1a7f5a07984823e111fd3e2698c70121143fdff54bca46fa82c066caeb611b0'),
 ('line_070','7659456162fa08e2281200070a30e6d22c1795fe33ba9055e7fd2f40bcf15387','118adf20b8240538a171a314329c040838c937e9e1a07fa4ce9b4c995b467247'),
 ('line_071','2c0e321c935bcc33c74d0bb5c022d15d67e2fe986577a31a29ecfbb4334e327e','790951be199b7a56a00a8e0508fe671c19d08d5ef31509a9b9e04af8642b2af6'),
 ('line_072','4c0ed588609b0153b4892756dddc3cf2934b4ece2c25b9d0210c3c700c16f2e5','c7aedfb0c786c3c212ecb6d477f75bd2e08404409c45375f5efae4303b2a9ec8'),
 ('line_073','663d20717edad1c0fde41c16ff4f91ca1d3b06331d47b8692494e199a6583a3c','3949584572880384c860740a83a886f61d5ffb188b44f6d1b2aa498f357557b8'),
 ('line_074','0030031cd556d083af8751067d6c7b20898cbcf0049fb092ff98e493c3024e6b','56621c0c194d839fdea10bcdbb9b5afe18d35676d26534a8e28cd1aabd4f062a'),
 ('line_075','2e1e492933e548b517c66c9b7a5a2bd3d43c48e4add2441b910795f1d8c90626','92d74fb004e1977162a695ea892beaeb231bf681dec068f8049a6cad7e4f4f72'),
 ('line_076','f532ab6d1c535f119e047de6401d8afd056e5e664e5328fa0d50dc1e639e03ef','463263edf1015710b89da41cda74ec276d44be69043985ef7d4d0e8c6916d71b'),
 ('line_077','99964babef11689a5a06df376eb6b6abbb2ba4971b868b975d28814c3f467a72','1e12fcc3a3ac44151b7a2b0621e6028dc888497d1d4c119778678e883ae112ed'),
 ('line_078','5f94c02af76bb5fbfbb2fa762030c8298989a01814dea61f9edfb235f3c3e2d0','867ef1254767809dbeb420776db537c53e42ce1f49ad3fdd9f9205c8141c63ab'),
 ('line_079','0f42ff014dc338ae6697f7e1c5329a80fe8faba1bc766ef512088c394f8d227d','a9f53d313add42b67646fcabfc8c15454934423c07089a27f03431093ead6bd6'),
 ('line_080','b90f4780bdce04097e8ea0e725adffbf9c195955208f1e09fe364e227d1244db','10acb6d8f1408b28e48e539aaee2b6bba2e4b8775719b249fd4cc1e35e279662'),
 ('line_081','936149d5afa22db6bba050982b56a6db02761985d0ed8311e186cd03c3bf7ae9','78f6ae05f6b8b8aeb52e3d920f15b854fc2fbac39411b70f2bbf33c37a4ba70c'),
 ('line_082','70aac78fcdc76911fc79c62f7ee83eda0f3a667bc9b30ad9f514094f452a6843','f177ac1e0986322653d73990c06ce6d2f182340a06407bb205d1edaed7ad9adf'),
 ('line_083','01c26ebebb6de5239877a63fcf19b4bf156c5337fe0fc0e0d6388b15308a141a','373336ca76910f9610b6283364a3558f0de05bdcf8304ccc7abb5c5d5da5735c'),
 ('line_084','3c3b5d4d17d0b40723f282f3bacfe2ae617f72ea3a77530449a82a6347eccafa','25ff1a80114937bd8fed4c817e2f5a1dcc2a46faa1127834a8d13584c8f9e01b'),
 ('line_085','c0c485127747e287b5365a74adc6f71e6ab6d1e78e21aec4187f859ee2c0a96f','95e6793f84b5258bed873b55c615a82291d430e18e67b273c6572948a240ed4e'),
 ('line_086','474eaf7f94c35d961c91028bc5083af495e652ac35e38265a70ab5eecbbbbd06','c9ce176240133f62c32cdf51162ab51371a0f4d2411eeb19a271bda8fe6f31f3'),
 ('line_087','2d00c43ceecd0af8f0d817839150bb74b35e3d995672df053061e39bfb7e4480','304d3bfd20622325b3275a9ebcff6e9a3b3320dfe065bcc8fd42f497075adda5'),
 ('line_088','a48993cb023a712262c4d82b613c442b4ea7c9aa7178a710c41c34acca0d72e7','dbd5bcb8f093e45328775c608f0a6180c52d5d1a10cc7ea0fc8ecef718f3d878'),
 ('line_089','7248e7ba7fd4cdf965b7cad618fed1f642a0e901acf93e784f24ef3b731dffc2','841a1addceed899bd9f2407b6c6d77194ac0145a282f2372904a94c0c3ac3835'),
 ('line_090','2ef59711c1d42615a29f51b581378341e17c1364040c0428b4b684c0334a1655','ad16baf17196e3ce98a5e09abecdac7272d9db01cbd59246804d20f4b0850025'),
 ('line_091','e8cac3d65fb9130a6c43262b70b8b2a1cf2c889d8dbe1917510696f549de3790','d5293d9c8d569d47b4d2cf63674e6dad37791e9edd55aab79f651bc94bc4b6d4'),
 ('line_092','99357f3101ef354720e8e96eae08f4e4ee11cab3c194f6b1c9e9154b3d58ebca','add774369faadce4efcfc790d6a5216549daee2c014682c1ecc8a236932a5fd1')
)
SELECT l.recording_id, l.line_id, l.take_id, r.role_id,
       l.audio_key AS old_key, l.audio_hash AS old_hash, l.duration AS old_duration, l.bytes AS old_bytes, l.updated AS old_updated,
       n.audio_key AS new_key, n.audio_hash AS new_hash, n.duration AS new_duration, n.bytes AS new_bytes
FROM episode01_revision_jobs v
JOIN dubbing_recordings r ON r.project_id=v.public_id AND r.user_id=v.owner AND r.script_key=v.public_script AND r.state='submitted'
JOIN dubbing_recordings t ON t.project_id=v.stage_id AND t.user_id=v.owner AND t.role_id=r.role_id AND t.script_key=v.stage_script AND t.state='submitted'
JOIN dubbing_role_claims c ON c.project_id=r.project_id AND c.user_id=r.user_id AND c.role_id=r.role_id
JOIN dubbing_role_claims d ON d.project_id=t.project_id AND d.user_id=t.user_id AND d.role_id=t.role_id
JOIN dubbing_recording_lines l ON l.recording_id=r.id
JOIN dubbing_recording_lines n ON n.recording_id=t.id AND n.line_id=l.line_id
JOIN verified_hashes h ON h.line_id=l.line_id AND h.old_hash=l.audio_hash AND h.new_hash=n.audio_hash
JOIN json_each(v.script,'$.lines') script ON json_extract(script.value,'$.id')=l.line_id AND json_extract(script.value,'$.roleId')=r.role_id
JOIN json_each(v.old_manifest,'$.lines') old ON old.key=script.key AND json_extract(old.value,'$.id')=l.line_id
JOIN json_each(v.stage_manifest,'$.lines') fresh ON fresh.key=old.key AND json_extract(fresh.value,'$.id')=l.line_id
WHERE json_extract(old.value,'$.takeId')=l.take_id AND json_extract(fresh.value,'$.takeId')=n.take_id
 AND json_extract(old.value,'$.key')=l.audio_key AND json_extract(fresh.value,'$.key')=n.audio_key
 AND json_extract(old.value,'$.userId')=v.owner AND json_extract(fresh.value,'$.userId')=v.owner
 AND json_extract(old.value,'$.start')=json_extract(fresh.value,'$.start') AND json_extract(old.value,'$.end')=json_extract(fresh.value,'$.end')
 AND instr(l.audio_key,'dubbing/'||v.owner||'/'||v.public_id||'/voices/'||r.id||'/'||l.take_id||'-')=1
 AND instr(n.audio_key,'dubbing/'||v.owner||'/'||v.stage_id||'/voices/'||t.id||'/'||n.take_id||'-')=1
 AND l.bytes>44 AND n.bytes>44 AND l.duration>0 AND n.duration>0
 AND length(l.audio_hash)=64 AND length(n.audio_hash)=64 AND l.audio_hash NOT GLOB '*[^0-9a-f]*' AND n.audio_hash NOT GLOB '*[^0-9a-f]*'
 AND NOT EXISTS (SELECT 1 FROM dubbing_audio_cleanup WHERE object_key IN (l.audio_key,n.audio_key,v.old_output,v.new_output));
--> statement-breakpoint
-- A single INSERT (including this trigger) performs the audit and both updates atomically in SQLite/D1.
-- Invalid/missing production inputs abort the INSERT. Empty developer DBs do nothing.
CREATE TRIGGER episode01_revision_apply AFTER INSERT ON admin_audit
WHEN NEW.id='official-episode01:performance-v2'
BEGIN
 SELECT CASE WHEN json_array_length(NEW.target,'$.lines') IS NOT 92
 OR (SELECT count(DISTINCT json_extract(value,'$.line')) FROM json_each(NEW.target,'$.lines'))!=92
 OR (SELECT count(*) FROM json_each(NEW.target,'$.lines') WHERE json_extract(value,'$.role')='doyun')!=45
 OR (SELECT count(*) FROM json_each(NEW.target,'$.lines') WHERE json_extract(value,'$.role')='seria')!=47
 OR json_type(NEW.target,'$.publicJob') IS NOT 'text'
 THEN RAISE(ABORT,'Official episode source data mismatch. No audio changes applied.') END;
 UPDATE dubbing_recording_lines SET
  (audio_key,audio_hash,duration,bytes,updated) = (SELECT json_extract(row.value,'$.new.key'),json_extract(row.value,'$.new.hash'),
    json_extract(row.value,'$.new.duration'),json_extract(row.value,'$.new.bytes'),NEW.created
    FROM json_each(NEW.target,'$.lines') row WHERE json_extract(row.value,'$.take')=dubbing_recording_lines.take_id)
 WHERE take_id IN (SELECT json_extract(value,'$.take') FROM json_each(NEW.target,'$.lines'));
 SELECT CASE WHEN changes()!=92 THEN RAISE(ABORT,'Unexpected number of updated takes.') END;
 UPDATE dubbing_final_jobs SET output_key=json_extract(NEW.target,'$.newOutput'),output_meta=json_extract(NEW.target,'$.newMeta'),updated=NEW.created,
  manifest_json=json_set(manifest_json,'$.lines',json((SELECT json_group_array(json(entry)) FROM (
   SELECT json_set(line.value,'$.key',json_extract(row.value,'$.new.key')) AS entry
   FROM json_each(NEW.target,'$.oldManifest.lines') line JOIN json_each(NEW.target,'$.lines') row
    ON json_extract(row.value,'$.take')=json_extract(line.value,'$.takeId')
   ORDER BY line.key))))
 WHERE id=json_extract(NEW.target,'$.publicJob') AND state='ready' AND output_key=json_extract(NEW.target,'$.oldOutput');
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Unexpected final job, audio changes rolled back.') END;
END;
--> statement-breakpoint
INSERT INTO admin_audit(id,admin_id,action,target,created)
SELECT 'official-episode01:performance-v2','operator-approved-migration:0099','dubbing_voice_revision',
 json_object('publicJob',(SELECT public_job FROM episode01_revision_jobs),'stageJob',(SELECT stage_job FROM episode01_revision_jobs),
  'oldOutput',(SELECT old_output FROM episode01_revision_jobs),'oldMeta',(SELECT old_meta FROM episode01_revision_jobs),
  'oldUpdated',(SELECT old_updated FROM episode01_revision_jobs),'oldManifest',json((SELECT old_manifest FROM episode01_revision_jobs)),
  'newOutput',(SELECT new_output FROM episode01_revision_jobs),'newMeta',(SELECT new_meta FROM episode01_revision_jobs),
  'lines',json((SELECT json_group_array(json_object('recording',recording_id,'line',line_id,'take',take_id,'role',role_id,
     'old',json_object('key',old_key,'hash',old_hash,'bytes',old_bytes,'duration',old_duration,'updated',old_updated),
     'new',json_object('key',new_key,'hash',new_hash,'bytes',new_bytes,'duration',new_duration)))
     FROM episode01_revision_lines))),unixepoch()
WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id IN ('b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899','c86de6bd-1ac6-45ec-96d3-b361b366591a'))
 AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id='official-episode01:performance-v2');
--> statement-breakpoint
DROP TRIGGER episode01_revision_apply;
--> statement-breakpoint
DROP VIEW episode01_revision_lines;
--> statement-breakpoint
DROP VIEW episode01_revision_jobs;
