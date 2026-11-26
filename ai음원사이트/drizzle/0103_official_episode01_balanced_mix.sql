-- Keep the existing public edition, share URL, credits, social activity and recording identities.
-- The staging performance stays private. Its immutable audio objects have already been rendered.
CREATE VIEW episode01_voice4_jobs AS
SELECT p.id AS public_id, s.id AS stage_id, j.id AS public_job, k.id AS stage_job,
       j.manifest_json AS old_manifest, k.manifest_json AS stage_manifest,
       j.output_key AS old_output, k.output_key AS new_output,
       j.output_meta AS old_meta, k.output_meta AS new_meta, j.updated AS old_updated,
       p.owner_id AS owner, p.script_json AS script, p.script_key AS public_script, s.script_key AS stage_script
FROM dubbing_projects p
JOIN dubbing_projects s ON s.id='09c19c23-f7ee-4bc3-a57a-bdb59f3f1817'
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
 AND json_extract(k.output_meta,'$.sha256')='a55bb871fb5ed53005d490d9a6966098d05c0dcb6b1769208168a0d74e7609a8' AND json_extract(k.output_meta,'$.bytes')=4699279
 AND json_extract(k.output_meta,'$.sampleRate')=48000 AND abs(json_extract(k.output_meta,'$.duration')-json_extract(j.manifest_json,'$.duration'))<0.1
 AND EXISTS (SELECT 1 FROM admin_audit prior WHERE prior.id='official-episode01:performance-v3'
             AND json_extract(prior.target,'$.newOutput')=j.output_key AND json_extract(prior.target,'$.publicJob')=j.id)
 AND instr(k.output_key,'dubbing/'||s.owner_id||'/'||s.id||'/final/'||k.id||'-')=1
 AND (SELECT count(*) FROM dubbing_role_claims WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recordings WHERE project_id IN (p.id,s.id))=4
 AND (SELECT count(*) FROM dubbing_recording_lines l JOIN dubbing_recordings r ON l.recording_id=r.id WHERE r.project_id IN (p.id,s.id))=184;
--> statement-breakpoint
CREATE VIEW episode01_voice4_lines AS
WITH verified_hashes(line_id,old_hash,new_hash) AS (VALUES
 ('line_001','6e221731da360a0b3824b190eb86ddf8bd201897e8e9c30ac2207df604928a3c','2a956be01188e22a663d323f480a6074285b025e72ed432affb78005b5a73ad8'),
 ('line_002','d45146f7c6bee3772f38037bf27bbeddc06d30ada587346996dcad349b374163','1cba782439051f505c0f7345697fb01f973b65fc309f1291cc63f87f4fdb40a1'),
 ('line_003','164e16be687e5fc09ddac15174bd34d3877f3ba2aab87a0273eaa7e98d58dc74','6f809b7f86e69bf4c0caa89d70db38d9ac57a2b517a3249042fb0c87f98c99c8'),
 ('line_004','b39476c520bf4570266fe87420ac37147697538137c40ade860ac440750f40eb','6de261cebb597195627e721f3ede583fdecc58a6843232b518b4cf86ad33e971'),
 ('line_005','d900f1b5d4a4c785e608ec89ef09c6013d98ae37536c7b7b9a5fd64e929242b4','b5d7a5c252d533e6b49c47c37b66c411228a54a05649a7782e421a33c5bbf9d6'),
 ('line_006','5fc7f8f4cbdc16466c9f8a9792bedf52962adbf438c0e6b962c19efe3a4ffc1b','770a227715891c43fd5063ec7539bf8c51db227169eed8aa23399d0ea49215a8'),
 ('line_007','ec83bcb4d5a62c12701d0075b20119892fbbc69bc28cd53dd806be2ade76dac4','5db730811d07ac5e22ad70611ab0cf006e200f3fa73898251de6ba1a3a11a07f'),
 ('line_008','4e8795cc4450eb69cd6d19e2292fcf4057aeee36b75210455618571d62bc402d','6fb81ec7b8e83ab6319f7e4a569cb2a1c46b40f2a603f66ef2d2856a26653608'),
 ('line_009','d81c9c832345c73c9e014882c0c0a024937a6d4c36be6195c50bb210150fbd8f','cda2f53e67c1a3181083610b1d5861585bf6f18b14bf828105301bbcffe01c1d'),
 ('line_010','a32bf2e8fb9154b029211b2a444cb47cdd0860b30d070032ec7f6a148b5a0e02','bf9512bc3f62fd31a77fa735b9a7207834ac7d135f1769741f3d1ed527d580aa'),
 ('line_011','844d38557ca8b78b7e9e64d17a4fef371541a933e3771999b1299f3d409eb4db','d12bd620ae86e3f0fd09026c473d4ac0a6f2433fe3b25e9bb7adbe0813ee0dcb'),
 ('line_012','3ab9d89c7dc1a0f060764c296d6720e8bf5385e83c6a529320654b7fb142583e','32abeac0b73becb2b366a7a8cc154b95feb43a8c93801ee66559293b003b0a86'),
 ('line_013','6d94cd5b8a8db1370d71bea54767ae473b2934823007107657b36a7a5ed15b1f','1ec1b9e709b599752dddce97c4ab93dc3f2752b6cafb5553b1664832b9f52af8'),
 ('line_014','afa227df534504f096595caf011680d610149cbfd8f137e87b12408e770a4287','9b55922cec559ed4151d177822c4e13bb2deec38544365695a6577ee879cb99f'),
 ('line_015','fe9713b7bbf71c007330cfc58c2e7c0d1c8ec8b98f1f13421c92abb297d02dea','1677e3a3c314a7b9c531269fccc31be7583445f9a46da7d8087ef238d40db54e'),
 ('line_016','c4a2ae59f4dd85bd12226710e76a912a2410cb395d7852c50b2b235d6a3ad594','cc10cc055b399bb341ff3e0df9d4b7aaed9826c95d21fc4afb8c84900425ee04'),
 ('line_017','f2406d68fa05127c25b0a8821a46251999b6ee99c8de80be2632652d6ec8a3f2','15c49caa1827104962700868b48940e9d3f14191c35b6d7a2bd8f6763d174b67'),
 ('line_018','6015b4d98c7541b8425077981802d4bf71d560b614e800ea75f0c5017347974a','46081982c510b1ebb6d7a21cfbdf81a76caf6a1fc73b864ee7222e2672370302'),
 ('line_019','f3526e8738a99c0815f8158159bc0a62d81e19eab4012b49fcab2310835dd476','b0045d886963ef825dc57524113d53f6fcbf83530ba61938488158c1090151b4'),
 ('line_020','fbdbeb9ba21bd9507598fbcf214fb0972fc9bffc6a68e708164e7888ead3b91a','37fa44cb4e8c6933a419527091c938aa9ca137efb29d78e9276ae75317da6e1b'),
 ('line_021','a78dfc23dc8bfe5c421f953686de05eb92f9e404f533308334b634e7c55ab69c','0959e103a51ed091dcacf12f56231b16d712dbab2da18897ea5ac05d7100b2ac'),
 ('line_022','5a0b4ef74ec420a50a1e77703b9e5b434c12e91b9f5497dcc916b0e419b6de1b','65e9568987cd19351cfd45f9e5a3aaf1da93c4b7427c5d938ddfa0b25dc97224'),
 ('line_023','13f6b3ca2de365e44b42eaeeb5f0829b9e601b525317e9a70c3d31df77b23b46','d8b81bbee686b88d726737ae82e9bf44f2dff02acb7d06e63af6c68891d3c021'),
 ('line_024','0e9e375e7edaf542048edf5be4cc89ff794912158baf216952e8524ed3d4e245','67e3a2edbc382cd0f11cdf897787fea47aff202fc5cbc0a335139ea1d7d996f8'),
 ('line_025','cd711d8383906a958d15b748ca1a4aa17a2bf87873c5108bce2e520afdbfcdf8','033bc724c34f221afe28c4655930fd73ac3a533d877d49b7e6d6cfa9f5f37a18'),
 ('line_026','fd40698c24126877cd16539dc4d911bbc6568edbecc9435da604d6279c052b4d','e7668f077305a9d2347e3a0ecd3b55c38acef60fb54216166f270b2a3db0598a'),
 ('line_027','94499a7df84b804e7b91b2f6b5219b51814d51f14e7a0cb942f66b9d01c5734a','cb2e9fd0730d487c82be7493a873cc66437b6e8785fc89134b9224168cf661f2'),
 ('line_028','e192fca3057e2708ab0dac8c0020afa12fe5aafce97386dddfcb5b8144ed4f0e','afc3aaa0e7ea108f1f6d1a8b705db86e282e3ac923b810a8e07c85c2a28a1de3'),
 ('line_029','c4115431ea52018e4f9bb4ea0a1710100750d7f3680b165e687a82eafd87400f','7756a54dea1490d84d11ae09f3813db22eae2be1927c92587fd9bc8c19502c15'),
 ('line_030','ac4faca8a68d7f3ba3ce9f65bda06a91307aab4119401c147bfb8da6a57ac649','c3e9d99346dc85fd70dc933ea963b89f9f5ed263cf7d676918b2ce8e249053f8'),
 ('line_031','e14c217fbdb9eaabc17cce283ae7ad9128df022b752a1bd7f16ccd0a27d8d717','3fdc64f58f2fe422b93e95a3bd3b56173f3af32815ab237279d220afb87382fa'),
 ('line_032','8c0988633ad75c7ef8afb19ad27d4a31b596b53215c7cf577936e28547137527','630b7e6b5b9ea020cbaae0a8e2182e33986c04c56b646eaf7792e0df160b9cf3'),
 ('line_033','0b312ff587cb4d8f37ffcd4895cd7b015a69069b29d20b893cb2595febdecf16','79b96ba39b2c93a5b42c13b0d542f428aac5279c853e94ccd3deed24d7e0429c'),
 ('line_034','7898d665022ba7fcb9096d1ca9abb9131b2f720c3787ec0abe5f30a0b2d75ca5','680a96ded2eeee1d7092ed5be8a962be95d599e71b78dfb5c4e408653c6f340c'),
 ('line_035','da46c17bbe1fcddbd296801f6ab7d5a2ac4487392a5866a7e86d5192429afd30','39222d2e66b6847e993d0766fff97dafc5a9c13c519551fd009b41c4697f87f3'),
 ('line_036','797da45ce617db8e658d38463742bb32ea74dbdcb067b8462ab6d70dd03bc88a','f1776aaf2073d4b64cabb8fc3d18bf7a617f5522ebc88760e2cf1623acbd7f05'),
 ('line_037','98328c5567d66dbef39fa3fd425449503cf92dcd5da30262ad6901dee6fee123','957860bd590e1f16f03e33fd8acb171abfea95aca8b100483fe2fb73c85ce0ca'),
 ('line_038','56bba8aa92ba5dc3ab3d7a6dc0db6be81db28ad5717f864ae65addd699df678c','ee8fc142e697bce2df9cf9ee9059283fb04ec9dc3408c38496255407b05c0ee0'),
 ('line_039','cad23d99429e2b375fd82ac4b4ca61f4cb071e2a44ac6ec147cf056d31ecc12e','e53c250656f0654ac5655ccd2919ad22c79e97e42bc213f9e609bfb65d28e641'),
 ('line_040','0855429751fed27997c30add44e9ce053f30693e3dc7a9d68c505571a2461b00','43cd883c9555b05c322887c1214aac225bda876eeb08ff9b3c52b53e10bffbd3'),
 ('line_041','245102382023e8e1086ddae8439babf0bf911ea1a545450176e7a243650074a2','5099b0258de323c5c3ea5130bee13f76048705c875de5cba49d139a3f67b4ec0'),
 ('line_042','045513aec27edcd433b856dafbc8057616a9a6091f6e584a0d01fdfedbee5973','5f4d20a64f974301ab3c2a5d6026cfc8af6cd5ffe132e66f7353c6637c724451'),
 ('line_043','acaea866b9d75b5c02ad9c6cd22187849d4374e87fdb603cb0e981f91c2a0362','b1575e00b7837f15e3368e9aac92eb91c802b17727fee46a5f6515646c74b06a'),
 ('line_044','85564cca682f78dc94b9fad6b62fd6a8bff00ccae0e43d2cbc6df659b0055892','091228c59ae166bc433f0911a54a9e839b2e9614ec5fec95ef1588f77956da36'),
 ('line_045','c6f301f0556cc6d7b1bbac4ac5e037b787e6330296a69b92ce363b00afaf8165','86d0f6cd15886ade9cdfd5a5784f921566b2113277b0c8f2784d5b30e9c19ae2'),
 ('line_046','65f150627bde4079b40965e3a2d3d3e3251fdee5f51f0a765866ec7f46e4d90c','2da135b7c29285f442bfcd108af1db61c5f7e781c165089d9c87e44d597a1048'),
 ('line_047','889f495e2b3d9c03ec66a902c7a902b110d8254f9d1e3df600284ad269ffe146','b13ebe2d5d6df452a91d174512cde03f0d7752833ccff10a55bebe76d5528c95'),
 ('line_048','d9e176ef459940c7cc78ee1dc6802784a10e71a1517dcc88a84826a9c76b66e0','4a6faf90a1eeccb82e17ac61dcbbad966417c2b4a21e0e38b8118d998047c55d'),
 ('line_049','25526059b8f2601b6ba513e1b0aab5f10464f227ebfd7c2752ebe47065262f7a','3e3689e525c6ea62d8a4d40abd3d375d708aedceb81e4e80c6a6c4879ca9b87a'),
 ('line_050','074c13203f67a01a728b9c764c49e6fe8ec8614f2eebc28893ee50240e216004','31ee5a54a167130fac951cfeb1dffc5b95b2ba6d1a85753985a44bc3bb48e866'),
 ('line_051','04e25c07d8766f33e26bbd843ceed74d00f7e78126205a1eea0caa8b701f4762','d8840e7396589d8c1b6ad596a06997c443c2d9e1f48e3f00eb34f6e9ae429a08'),
 ('line_052','6bd9a70acc2e5ac4af25e7600aa0b138b205bf8412f266a5db6147c194283508','26752bd49dce37ec120afc88e0ff58248d14a87b7066e2b9a33026da8a1163ed'),
 ('line_053','487a36d14c787187048792699fef8864ce38ca5b30259d8b7149b12838c6b80b','f2ab4bd42fc014b134c5c2671cd168fd72fe65006a213be05bd4506c3ce2ca24'),
 ('line_054','aea13ba854868648adefb2c159aa7dc2ef547e7b44c317cfc52cc2e2bd328085','479782a57f4acf9726f2e71b7a6fc7a77b6dd7716008681c561b9115fb13c055'),
 ('line_055','9e9a213c4367020d3b56c3995cc2e65fa1aa1a227f470e7cf015b53ecb1a4a24','f86198c00dd99fe07c335178ff62ada0b312e7cfca549b08f739311d48961079'),
 ('line_056','610cb243ea931062ff10cb585b7d7ef745ae5e4ca286cee3152528456509614b','3e3ca82c28441cac132f112a9382e8712ab5eeccda13de0030fa47db1c1cfc73'),
 ('line_057','5b2cf1c43b1022cde649a461bc35d64ae41e35af0e376f8fb503eb282cef0430','56f37fd1e5e0af6a2b646315010522f1e381cdba3207a30188cfa3d609bb4daa'),
 ('line_058','d313b9e29c2b31fa4357bc923d0deda037d2cedd6bd7b75040e131afca4660df','37347b0cf8083e1bce1e45a8074f93199e5e50d1348d4fe3d2cadcd1b6f67f15'),
 ('line_059','1dc179c7248ea1ec0834b024d2bb01a3fda1f3d4128c28151417071f31f42ee7','6f1c98256c0b795922c1264dda2ad2d83ba557b4b4e4b2c4abec3efbc58ab4b5'),
 ('line_060','66bcb77cb9a4bc7c10a7e579fc04e13a583edc9709c0ff53a8ab172adbf9d35e','50cffcf225ba6c4d5e5aee89d595a50fbc2ebe6926dafd23286f6b21424f97a3'),
 ('line_061','414103ac06653998f1c9f1df8084a8d2d9c59cae57de7de0522ad00cf5d39e5c','e66bb015ea61fa2042f68f9dc457945372f0c0ddae9c943609836d9de77013aa'),
 ('line_062','b3d7a5d173aca80b9bde3c5c14a70c753e6c8ce463e60e0d26591921be852dcd','92228fea56bf75de7422a635a7141d50cc2aac71e46dad506badfc82ed80407b'),
 ('line_063','003cb6d841ee5f10513ec295ee6824cb4d11761859b4d4dd1f7708a2c71696c8','8022ed2740500c76591eed41cb244414d2556f30ecf8ab52cf606e54d4d18439'),
 ('line_064','43e57f50824bbdd5a65fcd36da3b12672e81f10df94d4fca4f38e9f1cf34c3ea','33a1b1bbb5276aecf0ed699de3d1bcb011e0df591ea60084ae1f30a1bbc03b7c'),
 ('line_065','d2e98026ccb65e9e1b76dbc234c726f32e05a8cac16fe47d5bf837ad2af5d9ba','e5de36043ecf2cb973cf243679a7003738fd2c139395bebe47c9e02ebf428a2f'),
 ('line_066','694d28eabb2061887cd9e1379b43943b74dd0bdbb51b2952be7cb307b73defad','72421f4ed5e7412cf5777399e647ddfa6d90df7fed8497a3090df89380ec8016'),
 ('line_067','62be4089683c70f82b5f4d2400f69994eff7dcf43fa726fab45ae491fc2da38f','5cbc3adb8734db177137ce0505aa2184aff3eada5121c7a86d437925bc747333'),
 ('line_068','ff156ce395b7fb05ffa9a27d42c630b4d2ae2f2ac5aa5d8edc79c97b1bcd0eaf','2484cfb676da5769889406e708a490440689228f88ab80396ad0f7aa25dece85'),
 ('line_069','c1a7f5a07984823e111fd3e2698c70121143fdff54bca46fa82c066caeb611b0','0ab2fa707c265faac2d0d50317697fe6c166e9f99e14495fa65b7ff662a10649'),
 ('line_070','118adf20b8240538a171a314329c040838c937e9e1a07fa4ce9b4c995b467247','9229456f89e93e42f7be870dc2f225a6fe3355ad58082e71fba5dfa94785752d'),
 ('line_071','790951be199b7a56a00a8e0508fe671c19d08d5ef31509a9b9e04af8642b2af6','883ece3571a96d1557de7da7b8a7a4fd1261360d546fc8a1189308b8be94eb78'),
 ('line_072','30d679e5b589acbd45e27696f4ea3091ab2911e00abee98365d24c0fc8bf32a3','5ce86650170188cf2df921ce01c3c8be0c4c1c6c5d182cf5359701e08d1c6b99'),
 ('line_073','3949584572880384c860740a83a886f61d5ffb188b44f6d1b2aa498f357557b8','783f5e3b74a77c4270aebfb04d6e1c156dfc1ea1119b89e79bba5b7893b2d6d8'),
 ('line_074','5476f5789bf0a17bc0da5f3e8346bf1da00c6bc604ddffd86f0f622c3f667c74','a7f8a1ec5a8420e547b34e943b5fb1412c1f7a81f3090907964e85629eb93885'),
 ('line_075','f2d54d72ce723df696b141dc18c37e5891498331aa1ed71f98f613c476eb872c','36161652239176c27224120737fb1f671208bc05a07dbe1a2090fb66a64ab167'),
 ('line_076','463263edf1015710b89da41cda74ec276d44be69043985ef7d4d0e8c6916d71b','36c58728a690879a4056954c54c22f9d34ee42dafb7ebe8397f9abe8740ced2e'),
 ('line_077','43c61a38874072a91709790c8bbd203370fa2e55b323660f3cd41c65ea491121','0e4b196785c89983e9af464090bd67f4d5addbf4dfdafcf05cd524880f627e6a'),
 ('line_078','867ef1254767809dbeb420776db537c53e42ce1f49ad3fdd9f9205c8141c63ab','1056b33657efff92865520b006595cba3602ddb334657b5df7ebf5935372fb6b'),
 ('line_079','4fdbb5535e21d0fd3607774c094b3948eda0016c493b14d03a76e994745598b6','45b59e72b6c29807d2983810802b41c5a823ec7856a31b1e0a7e23b79e49cbfa'),
 ('line_080','10acb6d8f1408b28e48e539aaee2b6bba2e4b8775719b249fd4cc1e35e279662','fa975339b2dadc7581a95b88c7de0ebacbc834056d6fbf05860fe921c888f491'),
 ('line_081','78f6ae05f6b8b8aeb52e3d920f15b854fc2fbac39411b70f2bbf33c37a4ba70c','9d6093f575ab86e1f5b52fd911e77b84d3ccf7172bc4837d449bd2fb722f46ea'),
 ('line_082','59cda0f9c799398f6e617d96b30ab366b1d3a2ef963ee80d81fcd3b7733d0de7','f4486f11c9446bf64d13a88a41ae4c54b68c065c00f781063a10228cf67dfc90'),
 ('line_083','373336ca76910f9610b6283364a3558f0de05bdcf8304ccc7abb5c5d5da5735c','5167427a4903b53ae5a1f25bf148c5399a043f8ce61260062806bef0f2a33510'),
 ('line_084','25646b5ba4a93512cde7aa582df6ca50ee913be62eca51153e5ce80411e0c233','d8ca4ac05783052e02b40fb8b435aa4d372c4165eae2e46d6fee4e5b64dce517'),
 ('line_085','95e6793f84b5258bed873b55c615a82291d430e18e67b273c6572948a240ed4e','638b14e9bb03c4bb00fc65c3c7a745bea86b5e09a2d76769d45c46b51b96b1c8'),
 ('line_086','aabc8cf98c79963439cecaee0fe40f1189cac25dc4c1809b44cfc73a88185906','7d05b7da54cd40ea9f80204804592a0ef16ea16c4ae0222da144d31d80ebab39'),
 ('line_087','304d3bfd20622325b3275a9ebcff6e9a3b3320dfe065bcc8fd42f497075adda5','850aa9c48e114093d914197424f31160a52f44cec8345a55b47ecb6ada0c1fe7'),
 ('line_088','ad2b3749a90e3d3ee0c89bbf43bfa8e914017252196aa934da03096e8c7eb9d0','580fdae89ccffa0441570483b0e67b451d50b355b24a917d73f1e987373738ca'),
 ('line_089','841a1addceed899bd9f2407b6c6d77194ac0145a282f2372904a94c0c3ac3835','4c5e825b551cff6149029a5c3b58107d2893ab7573f3b20637e01c8052682ab2'),
 ('line_090','2f90ce1c796b72f718fee22da274b970a6cb7d44f40a1ba093e5c223b902fe99','64809b5c6a89d5c0a8721db23a04484841a54b223fed531d60def91ab3389a09'),
 ('line_091','d5293d9c8d569d47b4d2cf63674e6dad37791e9edd55aab79f651bc94bc4b6d4','7992e19ee1884ac61e705728d6cf1ea22b56e92e50e110c575381e4603cca485'),
 ('line_092','71e3f3f05f15ee7505c6c2f9246d261bc1051da8fe775921601d755ac3177110','8978ef348e57a431e8a5fa2863a437fb95a8c4c4d9ee95b4f65c6788cc05d2dc')
)
SELECT l.recording_id, l.line_id, l.take_id, r.role_id,
       l.audio_key AS old_key, l.audio_hash AS old_hash, l.duration AS old_duration, l.bytes AS old_bytes, l.updated AS old_updated,
       n.audio_key AS new_key, n.audio_hash AS new_hash, n.duration AS new_duration, n.bytes AS new_bytes
FROM episode01_voice4_jobs v
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
             WHERE prior.id='official-episode01:performance-v3'
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
CREATE TRIGGER episode01_voice4_apply AFTER INSERT ON admin_audit
WHEN NEW.id='official-episode01:performance-v4'
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
SELECT 'official-episode01:performance-v4','operator-approved-migration:episode01-v4','dubbing_voice_revision',
 json_object('publicJob',(SELECT public_job FROM episode01_voice4_jobs),'stageJob',(SELECT stage_job FROM episode01_voice4_jobs),
  'oldOutput',(SELECT old_output FROM episode01_voice4_jobs),'oldMeta',(SELECT old_meta FROM episode01_voice4_jobs),
  'oldUpdated',(SELECT old_updated FROM episode01_voice4_jobs),'oldManifest',json((SELECT old_manifest FROM episode01_voice4_jobs)),
  'newOutput',(SELECT new_output FROM episode01_voice4_jobs),'newMeta',(SELECT new_meta FROM episode01_voice4_jobs),
  'lines',json((SELECT json_group_array(json_object('recording',recording_id,'line',line_id,'take',take_id,'role',role_id,
     'old',json_object('key',old_key,'hash',old_hash,'bytes',old_bytes,'duration',old_duration,'updated',old_updated),
     'new',json_object('key',new_key,'hash',new_hash,'bytes',new_bytes,'duration',new_duration)))
     FROM episode01_voice4_lines))),unixepoch()
WHERE EXISTS(SELECT 1 FROM dubbing_projects WHERE id IN ('b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899','09c19c23-f7ee-4bc3-a57a-bdb59f3f1817'))
 AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id='official-episode01:performance-v4');
--> statement-breakpoint
DROP TRIGGER episode01_voice4_apply;
--> statement-breakpoint
DROP VIEW episode01_voice4_lines;
--> statement-breakpoint
DROP VIEW episode01_voice4_jobs;
