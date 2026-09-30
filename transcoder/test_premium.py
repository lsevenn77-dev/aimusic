import hashlib, json, pathlib, shutil, subprocess, tempfile, unittest
from premium import convert_premium

class PremiumEncodingTest(unittest.TestCase):
    def test_original_to_verified_aac256(self):
        def command(args):
            return subprocess.run(args,check=True,capture_output=True,timeout=30)
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            for extension in ('wav','flac'):
                with self.subTest(extension=extension):
                    source=root/('source.'+extension)
                    command(['ffmpeg','-v','error','-y','-f','lavfi','-i','anoisesrc=color=pink:duration=10:sample_rate=48000:seed=17','-f','lavfi','-i','anoisesrc=color=pink:duration=10:sample_rate=48000:seed=29','-filter_complex','[0:a][1:a]amerge=inputs=2','-ac','2',str(source)])
                    uploaded={};paths=[]
                    class Reply:
                        def close(self): pass
                    def request(path,method,data,job,content_type=None,headers=None):
                        paths.append(path)
                        if path.endswith('/output'):
                            uploaded['bytes']=data.read();uploaded['sha']=headers['X-Content-SHA256']
                        else: uploaded['finish']=data
                        return Reply()
                    def download(path,destination,job):
                        self.assertEqual(path,'/internal/premium-audio/test/source')
                        shutil.copyfile(source,destination)
                    convert_premium({'track_id':'test','original_ext':extension,'duration':10},request,download,command)
                    output=root/'result.m4a';output.write_bytes(uploaded['bytes'])
                    stream=json.loads(command(['ffprobe','-v','error','-show_streams','-of','json',str(output)]).stdout)['streams'][0]
                    self.assertEqual(stream['codec_name'],'aac');self.assertEqual(stream['channels'],2)
                    self.assertEqual(int(stream['sample_rate']),44100)
                    self.assertGreater(int(stream['bit_rate']),240000);self.assertLess(int(stream['bit_rate']),275000)
                    self.assertEqual(uploaded['sha'],hashlib.sha256(uploaded['bytes']).hexdigest())
                    self.assertEqual(uploaded['finish']['bitrate_kbps'],256)
                    self.assertEqual(paths,['/internal/premium-audio/test/output','/internal/premium-audio/test/finish'])

if __name__=='__main__': unittest.main()
