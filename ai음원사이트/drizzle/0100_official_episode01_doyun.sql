-- Keep the existing public edition, share URL, credits, social activity and recording identities.
-- The staging performance stays private. Its immutable audio objects have already been rendered.
CREATE VIEW episode01_voice3_jobs AS
SELECT p.id AS public_id, s.id AS stage_id, j.id AS public_job, k.id AS stage_job,
       j.manifest_json AS old_manifest, k.manifest_json AS stage_manifest,
       j.output_key AS old_output, k.output_key AS new_output,
       j.output_meta AS old_meta, k.output_meta AS new_meta, j.updated AS old_updated,
       p.owner_id AS owner, p.script_json AS script, p.script_key AS public_script, s.script_key AS stage_script
FROM dubbing_projects p
JOIN dubbing_projects s ON s.id='da6f2afe-aed7-4c17-af5f-25df22d45a16'
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
 AND EXISTS (SELECT 1 FROM admin_audit prior WHERE prior.id='official-episode01:performance-v2'
             AND json_extract(prior.target,'$.newOutput')=j.output_key AND json_extract(prior.target,'$.publicJob')=j.id)
 AND instr(k.output_key,'dubbing/'||s.owner_id||'/'||s.id||'/final/'||k.id||'-')=1
 AND (SELECT count(*) FROM dubbing_role_claims WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recordings WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recording_lines l JOIN dubbing_recordings r ON l.recording_id=r.id WHERE r.project_id IN (p.id,s.id))=184;
--> statement-breakpoint
CREATE VIEW episode01_voice3_lines AS
WITH verified_hashes(line_id,old_hash,new_hash) AS (VALUES
 ('line_001','6e221731da360a0b3824b190eb86ddf8bd201897e8e9c30ac2207df604928a3c','6e221731da360a0b3824b190eb86ddf8bd201897e8e9c30ac2207df604928a3c'),
 ('line_002','c26b4530c0a041a0d61f7e7e5ea251c0104f56a2d48cdf19cfe6a549902d5836','d45146f7c6bee3772f38037bf27bbeddc06d30ada587346996dcad349b374163'),
 ('line_003','164e16be687e5fc09ddac15174bd34d3877f3ba2aab87a0273eaa7e98d58dc74','164e16be687e5fc09ddac15174bd34d3877f3ba2aab87a0273eaa7e98d58dc74'),
 ('line_004','85b15be4193cd1aa83841649f0e93e18836b1d09fe9bcdf4a213069a23e086e0','b39476c520bf4570266fe87420ac37147697538137c40ade860ac440750f40eb'),
 ('line_005','d900f1b5d4a4c785e608ec89ef09c6013d98ae37536c7b7b9a5fd64e929242b4','d900f1b5d4a4c785e608ec89ef09c6013d98ae37536c7b7b9a5fd64e929242b4'),
 ('line_006','687a32f2b66d3721577339372a30d58a3226cba7e0944119107406a7d2910d0f','5fc7f8f4cbdc16466c9f8a9792bedf52962adbf438c0e6b962c19efe3a4ffc1b'),
 ('line_007','ec83bcb4d5a62c12701d0075b20119892fbbc69bc28cd53dd806be2ade76dac4','ec83bcb4d5a62c12701d0075b20119892fbbc69bc28cd53dd806be2ade76dac4'),
 ('line_008','96e3c23aa7edaf87e6264f256b7192c9374ad012c29093b20f2d5ac18e154854','4e8795cc4450eb69cd6d19e2292fcf4057aeee36b75210455618571d62bc402d'),
 ('line_009','d81c9c832345c73c9e014882c0c0a024937a6d4c36be6195c50bb210150fbd8f','d81c9c832345c73c9e014882c0c0a024937a6d4c36be6195c50bb210150fbd8f'),
 ('line_010','42cc269ede6a19a1207d9fd429464f7da829d31d9efa90e2e3ce08cb726a1eca','a32bf2e8fb9154b029211b2a444cb47cdd0860b30d070032ec7f6a148b5a0e02'),
 ('line_011','844d38557ca8b78b7e9e64d17a4fef371541a933e3771999b1299f3d409eb4db','844d38557ca8b78b7e9e64d17a4fef371541a933e3771999b1299f3d409eb4db'),
 ('line_012','d0730326f82569f63000eb413f83e621c72489708f3bf706461f90fd3c6174e4','3ab9d89c7dc1a0f060764c296d6720e8bf5385e83c6a529320654b7fb142583e'),
 ('line_013','6d94cd5b8a8db1370d71bea54767ae473b2934823007107657b36a7a5ed15b1f','6d94cd5b8a8db1370d71bea54767ae473b2934823007107657b36a7a5ed15b1f'),
 ('line_014','cd4f2139f1ce6b702be997ebefd348fa56f948a09a90d3106796ce8c4bd52b87','afa227df534504f096595caf011680d610149cbfd8f137e87b12408e770a4287'),
 ('line_015','fe9713b7bbf71c007330cfc58c2e7c0d1c8ec8b98f1f13421c92abb297d02dea','fe9713b7bbf71c007330cfc58c2e7c0d1c8ec8b98f1f13421c92abb297d02dea'),
 ('line_016','05242d86c381b5142ef0eb71136ecbf86f740be5689af8d387e2fe8ab8e1fcae','c4a2ae59f4dd85bd12226710e76a912a2410cb395d7852c50b2b235d6a3ad594'),
 ('line_017','f2406d68fa05127c25b0a8821a46251999b6ee99c8de80be2632652d6ec8a3f2','f2406d68fa05127c25b0a8821a46251999b6ee99c8de80be2632652d6ec8a3f2'),
 ('line_018','afe972bb47b2d8b6233b536f81e933db2f7a1cabbd617873039a6435af3a33ea','6015b4d98c7541b8425077981802d4bf71d560b614e800ea75f0c5017347974a'),
 ('line_019','f3526e8738a99c0815f8158159bc0a62d81e19eab4012b49fcab2310835dd476','f3526e8738a99c0815f8158159bc0a62d81e19eab4012b49fcab2310835dd476'),
 ('line_020','551c5362d3a46b8b04c7c9d6eb0d5b75df57244ee67d2c1b6c5cc03412b342e3','fbdbeb9ba21bd9507598fbcf214fb0972fc9bffc6a68e708164e7888ead3b91a'),
 ('line_021','a78dfc23dc8bfe5c421f953686de05eb92f9e404f533308334b634e7c55ab69c','a78dfc23dc8bfe5c421f953686de05eb92f9e404f533308334b634e7c55ab69c'),
 ('line_022','ad16e85d90c1028b62310aa9d956904950e397614af81d520baeba3d6a923e2d','5a0b4ef74ec420a50a1e77703b9e5b434c12e91b9f5497dcc916b0e419b6de1b'),
 ('line_023','13f6b3ca2de365e44b42eaeeb5f0829b9e601b525317e9a70c3d31df77b23b46','13f6b3ca2de365e44b42eaeeb5f0829b9e601b525317e9a70c3d31df77b23b46'),
 ('line_024','c94e474f26a0157e190d7f4b8a639ebb5d805c778b4a74a091e0f806a3e0fd05','0e9e375e7edaf542048edf5be4cc89ff794912158baf216952e8524ed3d4e245'),
 ('line_025','cd711d8383906a958d15b748ca1a4aa17a2bf87873c5108bce2e520afdbfcdf8','cd711d8383906a958d15b748ca1a4aa17a2bf87873c5108bce2e520afdbfcdf8'),
 ('line_026','4c8621f4c89a8375bf78d1137634d6149f33fd40168af5bf6a1448dc62d56f9f','fd40698c24126877cd16539dc4d911bbc6568edbecc9435da604d6279c052b4d'),
 ('line_027','94499a7df84b804e7b91b2f6b5219b51814d51f14e7a0cb942f66b9d01c5734a','94499a7df84b804e7b91b2f6b5219b51814d51f14e7a0cb942f66b9d01c5734a'),
 ('line_028','6910a7ef37000d90036d88fb83facadddb86a6552eab8144f08db4a5bbc37771','e192fca3057e2708ab0dac8c0020afa12fe5aafce97386dddfcb5b8144ed4f0e'),
 ('line_029','c4115431ea52018e4f9bb4ea0a1710100750d7f3680b165e687a82eafd87400f','c4115431ea52018e4f9bb4ea0a1710100750d7f3680b165e687a82eafd87400f'),
 ('line_030','3340173c07990e4c6e42f38d29050ab09420a9f121563249fa0cad573ff12d94','ac4faca8a68d7f3ba3ce9f65bda06a91307aab4119401c147bfb8da6a57ac649'),
 ('line_031','e14c217fbdb9eaabc17cce283ae7ad9128df022b752a1bd7f16ccd0a27d8d717','e14c217fbdb9eaabc17cce283ae7ad9128df022b752a1bd7f16ccd0a27d8d717'),
 ('line_032','2d8cc76d600a57c24f9b7117fc4f3ff423d59df0e4e81c3c79ed3799d3e3dcd0','8c0988633ad75c7ef8afb19ad27d4a31b596b53215c7cf577936e28547137527'),
 ('line_033','0b312ff587cb4d8f37ffcd4895cd7b015a69069b29d20b893cb2595febdecf16','0b312ff587cb4d8f37ffcd4895cd7b015a69069b29d20b893cb2595febdecf16'),
 ('line_034','2a7b97bf364af65f6f66062eaeadf7fc27ff77796f38d8778530f2e7f914445c','7898d665022ba7fcb9096d1ca9abb9131b2f720c3787ec0abe5f30a0b2d75ca5'),
 ('line_035','da46c17bbe1fcddbd296801f6ab7d5a2ac4487392a5866a7e86d5192429afd30','da46c17bbe1fcddbd296801f6ab7d5a2ac4487392a5866a7e86d5192429afd30'),
 ('line_036','aa08a57b9a61ea79c62d88bb66ab4f0ef637ed51dcd1de6f853dc549813fa0a3','797da45ce617db8e658d38463742bb32ea74dbdcb067b8462ab6d70dd03bc88a'),
 ('line_037','98328c5567d66dbef39fa3fd425449503cf92dcd5da30262ad6901dee6fee123','98328c5567d66dbef39fa3fd425449503cf92dcd5da30262ad6901dee6fee123'),
 ('line_038','138b492378d4bb37bb1d4e0cd3134cbdd6b3b68e28ad31044331097cf83c19f7','56bba8aa92ba5dc3ab3d7a6dc0db6be81db28ad5717f864ae65addd699df678c'),
 ('line_039','cad23d99429e2b375fd82ac4b4ca61f4cb071e2a44ac6ec147cf056d31ecc12e','cad23d99429e2b375fd82ac4b4ca61f4cb071e2a44ac6ec147cf056d31ecc12e'),
 ('line_040','10ba4c13411ad257ec5cdf2629520dccb7d9287bd94f9248786d60d59d988bf0','0855429751fed27997c30add44e9ce053f30693e3dc7a9d68c505571a2461b00'),
 ('line_041','245102382023e8e1086ddae8439babf0bf911ea1a545450176e7a243650074a2','245102382023e8e1086ddae8439babf0bf911ea1a545450176e7a243650074a2'),
 ('line_042','9f924f0814912587c5439c17d61b8fa811da6f7a3062d0d2ea6157cafcd5ba18','045513aec27edcd433b856dafbc8057616a9a6091f6e584a0d01fdfedbee5973'),
 ('line_043','acaea866b9d75b5c02ad9c6cd22187849d4374e87fdb603cb0e981f91c2a0362','acaea866b9d75b5c02ad9c6cd22187849d4374e87fdb603cb0e981f91c2a0362'),
 ('line_044','e1ed9fe5b77e1216b1f4076ef8798e78e9c1897447a42478631b7fc21d2d2c55','85564cca682f78dc94b9fad6b62fd6a8bff00ccae0e43d2cbc6df659b0055892'),
 ('line_045','c6f301f0556cc6d7b1bbac4ac5e037b787e6330296a69b92ce363b00afaf8165','c6f301f0556cc6d7b1bbac4ac5e037b787e6330296a69b92ce363b00afaf8165'),
 ('line_046','035d4b44fff071bfd81906526b415e90bf868e302f4b3d3839e378f003e356b0','65f150627bde4079b40965e3a2d3d3e3251fdee5f51f0a765866ec7f46e4d90c'),
 ('line_047','889f495e2b3d9c03ec66a902c7a902b110d8254f9d1e3df600284ad269ffe146','889f495e2b3d9c03ec66a902c7a902b110d8254f9d1e3df600284ad269ffe146'),
 ('line_048','4ab6ddde05b4ee9ed53c86129c37652186bace3153953a6c4b9cd5fc3bda9a84','d9e176ef459940c7cc78ee1dc6802784a10e71a1517dcc88a84826a9c76b66e0'),
 ('line_049','25526059b8f2601b6ba513e1b0aab5f10464f227ebfd7c2752ebe47065262f7a','25526059b8f2601b6ba513e1b0aab5f10464f227ebfd7c2752ebe47065262f7a'),
 ('line_050','6d63160636d58d84ef72383e69598e534c93a4fa41c75851e0138b1ba08d67e0','074c13203f67a01a728b9c764c49e6fe8ec8614f2eebc28893ee50240e216004'),
 ('line_051','04e25c07d8766f33e26bbd843ceed74d00f7e78126205a1eea0caa8b701f4762','04e25c07d8766f33e26bbd843ceed74d00f7e78126205a1eea0caa8b701f4762'),
 ('line_052','1860c1fe2ecaf5501b79fd74e50913412391aa382e646aa1b9a85c51ae673ca8','6bd9a70acc2e5ac4af25e7600aa0b138b205bf8412f266a5db6147c194283508'),
 ('line_053','487a36d14c787187048792699fef8864ce38ca5b30259d8b7149b12838c6b80b','487a36d14c787187048792699fef8864ce38ca5b30259d8b7149b12838c6b80b'),
 ('line_054','d146d92c6ded6caee06752d8ea14d832cc8cae294373176fa71464646af2b2f9','aea13ba854868648adefb2c159aa7dc2ef547e7b44c317cfc52cc2e2bd328085'),
 ('line_055','9e9a213c4367020d3b56c3995cc2e65fa1aa1a227f470e7cf015b53ecb1a4a24','9e9a213c4367020d3b56c3995cc2e65fa1aa1a227f470e7cf015b53ecb1a4a24'),
 ('line_056','caf64c372d26126aeeb98dda97c4fd95fe79c90172b4615ec84fc649086ae8d3','610cb243ea931062ff10cb585b7d7ef745ae5e4ca286cee3152528456509614b'),
 ('line_057','5b2cf1c43b1022cde649a461bc35d64ae41e35af0e376f8fb503eb282cef0430','5b2cf1c43b1022cde649a461bc35d64ae41e35af0e376f8fb503eb282cef0430'),
 ('line_058','ce84da7fd50d0e0ccdc3a7edb415dc5918a3c89b65603441f5f481ad34b1bfb1','d313b9e29c2b31fa4357bc923d0deda037d2cedd6bd7b75040e131afca4660df'),
 ('line_059','1dc179c7248ea1ec0834b024d2bb01a3fda1f3d4128c28151417071f31f42ee7','1dc179c7248ea1ec0834b024d2bb01a3fda1f3d4128c28151417071f31f42ee7'),
 ('line_060','e3a6924a8be2e8ec3a2ea9b1292bc51595bccca66b6604c1bf598218751952c1','66bcb77cb9a4bc7c10a7e579fc04e13a583edc9709c0ff53a8ab172adbf9d35e'),
 ('line_061','414103ac06653998f1c9f1df8084a8d2d9c59cae57de7de0522ad00cf5d39e5c','414103ac06653998f1c9f1df8084a8d2d9c59cae57de7de0522ad00cf5d39e5c'),
 ('line_062','8ec18611f2b0b6ae2600114a75437a880df4c1039bf65968836bbff182fe701f','b3d7a5d173aca80b9bde3c5c14a70c753e6c8ce463e60e0d26591921be852dcd'),
 ('line_063','003cb6d841ee5f10513ec295ee6824cb4d11761859b4d4dd1f7708a2c71696c8','003cb6d841ee5f10513ec295ee6824cb4d11761859b4d4dd1f7708a2c71696c8'),
 ('line_064','f230ad6739472a71caa0734452632a98a873b6fc75d9e18194619d85b2ddbcf0','43e57f50824bbdd5a65fcd36da3b12672e81f10df94d4fca4f38e9f1cf34c3ea'),
 ('line_065','d2e98026ccb65e9e1b76dbc234c726f32e05a8cac16fe47d5bf837ad2af5d9ba','d2e98026ccb65e9e1b76dbc234c726f32e05a8cac16fe47d5bf837ad2af5d9ba'),
 ('line_066','4aed941088a4f2d0e2e0d1476c07eb802534501444f25bfe03ef16891be206fa','694d28eabb2061887cd9e1379b43943b74dd0bdbb51b2952be7cb307b73defad'),
 ('line_067','62be4089683c70f82b5f4d2400f69994eff7dcf43fa726fab45ae491fc2da38f','62be4089683c70f82b5f4d2400f69994eff7dcf43fa726fab45ae491fc2da38f'),
 ('line_068','14f2c1988ef42b7d7d46da5d63d6e8c324b31c7f3dc6ea3d453a3ddd2bcdf3c7','ff156ce395b7fb05ffa9a27d42c630b4d2ae2f2ac5aa5d8edc79c97b1bcd0eaf'),
 ('line_069','c1a7f5a07984823e111fd3e2698c70121143fdff54bca46fa82c066caeb611b0','c1a7f5a07984823e111fd3e2698c70121143fdff54bca46fa82c066caeb611b0'),
 ('line_070','118adf20b8240538a171a314329c040838c937e9e1a07fa4ce9b4c995b467247','118adf20b8240538a171a314329c040838c937e9e1a07fa4ce9b4c995b467247'),
 ('line_071','790951be199b7a56a00a8e0508fe671c19d08d5ef31509a9b9e04af8642b2af6','790951be199b7a56a00a8e0508fe671c19d08d5ef31509a9b9e04af8642b2af6'),
 ('line_072','c7aedfb0c786c3c212ecb6d477f75bd2e08404409c45375f5efae4303b2a9ec8','30d679e5b589acbd45e27696f4ea3091ab2911e00abee98365d24c0fc8bf32a3'),
 ('line_073','3949584572880384c860740a83a886f61d5ffb188b44f6d1b2aa498f357557b8','3949584572880384c860740a83a886f61d5ffb188b44f6d1b2aa498f357557b8'),
 ('line_074','56621c0c194d839fdea10bcdbb9b5afe18d35676d26534a8e28cd1aabd4f062a','5476f5789bf0a17bc0da5f3e8346bf1da00c6bc604ddffd86f0f622c3f667c74'),
 ('line_075','92d74fb004e1977162a695ea892beaeb231bf681dec068f8049a6cad7e4f4f72','f2d54d72ce723df696b141dc18c37e5891498331aa1ed71f98f613c476eb872c'),
 ('line_076','463263edf1015710b89da41cda74ec276d44be69043985ef7d4d0e8c6916d71b','463263edf1015710b89da41cda74ec276d44be69043985ef7d4d0e8c6916d71b'),
 ('line_077','1e12fcc3a3ac44151b7a2b0621e6028dc888497d1d4c119778678e883ae112ed','43c61a38874072a91709790c8bbd203370fa2e55b323660f3cd41c65ea491121'),
 ('line_078','867ef1254767809dbeb420776db537c53e42ce1f49ad3fdd9f9205c8141c63ab','867ef1254767809dbeb420776db537c53e42ce1f49ad3fdd9f9205c8141c63ab'),
 ('line_079','a9f53d313add42b67646fcabfc8c15454934423c07089a27f03431093ead6bd6','4fdbb5535e21d0fd3607774c094b3948eda0016c493b14d03a76e994745598b6'),
 ('line_080','10acb6d8f1408b28e48e539aaee2b6bba2e4b8775719b249fd4cc1e35e279662','10acb6d8f1408b28e48e539aaee2b6bba2e4b8775719b249fd4cc1e35e279662'),
 ('line_081','78f6ae05f6b8b8aeb52e3d920f15b854fc2fbac39411b70f2bbf33c37a4ba70c','78f6ae05f6b8b8aeb52e3d920f15b854fc2fbac39411b70f2bbf33c37a4ba70c'),
 ('line_082','f177ac1e0986322653d73990c06ce6d2f182340a06407bb205d1edaed7ad9adf','59cda0f9c799398f6e617d96b30ab366b1d3a2ef963ee80d81fcd3b7733d0de7'),
 ('line_083','373336ca76910f9610b6283364a3558f0de05bdcf8304ccc7abb5c5d5da5735c','373336ca76910f9610b6283364a3558f0de05bdcf8304ccc7abb5c5d5da5735c'),
 ('line_084','25ff1a80114937bd8fed4c817e2f5a1dcc2a46faa1127834a8d13584c8f9e01b','25646b5ba4a93512cde7aa582df6ca50ee913be62eca51153e5ce80411e0c233'),
 ('line_085','95e6793f84b5258bed873b55c615a82291d430e18e67b273c6572948a240ed4e','95e6793f84b5258bed873b55c615a82291d430e18e67b273c6572948a240ed4e'),
 ('line_086','c9ce176240133f62c32cdf51162ab51371a0f4d2411eeb19a271bda8fe6f31f3','aabc8cf98c79963439cecaee0fe40f1189cac25dc4c1809b44cfc73a88185906'),
 ('line_087','304d3bfd20622325b3275a9ebcff6e9a3b3320dfe065bcc8fd42f497075adda5','304d3bfd20622325b3275a9ebcff6e9a3b3320dfe065bcc8fd42f497075adda5'),
 ('line_088','dbd5bcb8f093e45328775c608f0a6180c52d5d1a10cc7ea0fc8ecef718f3d878','ad2b3749a90e3d3ee0c89bbf43bfa8e914017252196aa934da03096e8c7eb9d0'),
 ('line_089','841a1addceed899bd9f2407b6c6d77194ac0145a282f2372904a94c0c3ac3835','841a1addceed899bd9f2407b6c6d77194ac0145a282f2372904a94c0c3ac3835'),
 ('line_090','ad16baf17196e3ce98a5e09abecdac7272d9db01cbd59246804d20f4b0850025','2f90ce1c796b72f718fee22da274b970a6cb7d44f40a1ba093e5c223b902fe99'),
 ('line_091','d5293d9c8d569d47b4d2cf63674e6dad37791e9edd55aab79f651bc94bc4b6d4','d5293d9c8d569d47b4d2cf63674e6dad37791e9edd55aab79f651bc94bc4b6d4'),
 ('line_092','add774369faadce4efcfc790d6a5216549daee2c014682c1ecc8a236932a5fd1','71e3f3f05f15ee7505c6c2f9246d261bc1051da8fe775921601d755ac3177110')
)
SELECT l.recording_id, l.line_id, l.take_id, r.role_id,
       l.audio_key AS old_key, l.audio_hash AS old_hash, l.duration AS old_duration, l.bytes AS old_bytes, l.updated AS old_updated,
       n.audio_key AS new_key, n.audio_hash AS new_hash, n.duration AS new_duration, n.bytes AS new_bytes
FROM episode01_voice3_jobs v
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
 AND EXISTS (SELECT 1 FROM admin_audit prior,json_each(prior.target,'$.lines') prev
             WHERE prior.id='official-episode01:performance-v2'
               AND json_extract(prev.value,'$.take')=l.take_id AND json_extract(prev.value,'$.recording')=l.recording_id
               AND json_extract(prev.value,'$.line')=l.line_id AND json_extract(prev.value,'$.new.key')=l.audio_key
               AND json_extract(prev.value,'$.new.hash')=l.audio_hash)
 AND instr(n.audio_key,'dubbing/'||v.owner||'/'||v.stage_id||'/voices/'||t.id||'/'||n.take_id||'-')=1
 AND l.bytes>44 AND n.bytes>44 AND l.duration>0 AND n.duration>0
 AND length(l.audio_hash)=64 AND length(n.audio_hash)=64 AND l.audio_hash NOT GLOB '*[^0-9a-f]*' AND n.audio_hash NOT GLOB '*[^0-9a-f]*'
 AND NOT EXISTS (SELECT 1 FROM dubbing_audio_cleanup WHERE object_key IN (l.audio_key,n.audio_key,v.old_output,v.new_output));
--> statement-breakpoint
-- A single INSERT (including this trigger) performs the audit and both updates atomically in SQLite/D1.
-- Invalid/missing production inputs abort the INSERT. Empty developer DBs do nothing.
CREATE TRIGGER episode01_voice3_apply AFTER INSERT ON admin_audit
WHEN NEW.id='official-episode01:performance-v3'
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
SELECT 'official-episode01:performance-v3','operator-approved-migration:episode01-v3','dubbing_voice_revision',
 json_object('publicJob',(SELECT public_job FROM episode01_voice3_jobs),'stageJob',(SELECT stage_job FROM episode01_voice3_jobs),
  'oldOutput',(SELECT old_output FROM episode01_voice3_jobs),'oldMeta',(SELECT old_meta FROM episode01_voice3_jobs),
  'oldUpdated',(SELECT old_updated FROM episode01_voice3_jobs),'oldManifest',json((SELECT old_manifest FROM episode01_voice3_jobs)),
  'newOutput',(SELECT new_output FROM episode01_voice3_jobs),'newMeta',(SELECT new_meta FROM episode01_voice3_jobs),
  'lines',json((SELECT json_group_array(json_object('recording',recording_id,'line',line_id,'take',take_id,'role',role_id,
     'old',json_object('key',old_key,'hash',old_hash,'bytes',old_bytes,'duration',old_duration,'updated',old_updated),
     'new',json_object('key',new_key,'hash',new_hash,'bytes',new_bytes,'duration',new_duration)))
     FROM episode01_voice3_lines))),unixepoch()
WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id IN ('b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899','da6f2afe-aed7-4c17-af5f-25df22d45a16'))
 AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id='official-episode01:performance-v3');
--> statement-breakpoint
DROP TRIGGER episode01_voice3_apply;
--> statement-breakpoint
DROP VIEW episode01_voice3_lines;
--> statement-breakpoint
DROP VIEW episode01_voice3_jobs;
