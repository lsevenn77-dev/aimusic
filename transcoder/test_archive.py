import json
import pathlib
import subprocess
import tempfile
import unittest
from archive import encode_lossless, pcm_sha

def command(args, timeout=240):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout)

class ArchiveTests(unittest.TestCase):
    def test_integer_pcm_round_trip_and_float_preservation(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            for codec in ['pcm_u8', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_s32le']:
                with self.subTest(codec=codec):
                    source, output=root/(codec+'.wav'),root/(codec+'.flac')
                    command(['ffmpeg','-v','error','-y','-f','lavfi','-i','sine=frequency=432:duration=6',
                             '-ac','2','-ar','48000','-c:a',codec,str(source)])
                    result=encode_lossless(source,output,command)
                    self.assertTrue(source.exists())
                    if codec in ['pcm_f32le','pcm_s32le']:
                        self.assertEqual(result['skip'],'unsupported_precision_keep_wav')
                        self.assertFalse(output.exists())
                    else:
                        self.assertLess(output.stat().st_size,source.stat().st_size)
                        self.assertEqual(result['source_pcm_sha'],pcm_sha(output,command))
                        probe=json.loads(command(['ffprobe','-v','error','-show_streams','-of','json',str(output)]).stdout)
                        self.assertEqual(probe['streams'][0]['sample_rate'],'48000')
                        self.assertEqual(probe['streams'][0]['channels'],2)

if __name__=='__main__': unittest.main()
