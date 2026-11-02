import os, sqlite3, tempfile, unittest
from pathlib import Path
from restore import restore

class RestoreTest(unittest.TestCase):
    def test_order_rollback_and_preserved_source(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);s=d/'source.sql';k=os.urandom(32)
            def write(data):
                s.write_text('CREATE TABLE ledger(id TEXT PRIMARY KEY, amount INTEGER, attachment BLOB);'+data)
                s.chmod(0o600)
            a="INSERT INTO ledger VALUES('a',500,x'00ff');";b="INSERT INTO ledger VALUES('b',-2,NULL);"
            write(b+a);expected=restore(s,d/'verified.sqlite',k)
            write(a+b);self.assertEqual(restore(s,d/'other.sqlite',k,expected),expected)
            with self.assertRaises(FileExistsError):restore(s,d/'verified.sqlite',k)
            write(a+b.replace('-2','-3'))
            with self.assertRaises(ValueError):restore(s,d/'wrong.sqlite',k,expected)
            self.assertFalse((d/'wrong.sqlite').exists())
            write("ATTACH DATABASE ':memory:' AS x;")
            with self.assertRaises(sqlite3.DatabaseError):restore(s,d/'attach.sqlite',k)
            self.assertTrue((d/'verified.sqlite').is_file())
if __name__=='__main__':unittest.main()
