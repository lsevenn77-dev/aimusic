package kr.co.aifect.app.karaoke;

import java.io.IOException;

/** Reconcile an interrupted submission before sending the same audio again. */
final class CoverSubmission {
    interface Transport {
        String status() throws Exception;
        void upload() throws Exception;
        boolean complete() throws Exception;
        boolean recoveredUploadAd() throws Exception;
    }
    static boolean submit(Transport transport,boolean retry)throws Exception{
        if(retry){
            String status=transport.status();
            if(submitted(status))return recoveredAd(transport);
            if(!"uploading".equals(status))throw new IOException("음원 처리 상태를 내 업로드에서 확인해주세요. 초안은 보관되어 있어요.");
        }
        try{transport.upload();return transport.complete();}
        catch(Exception failure){
            try{if(submitted(transport.status()))return recoveredAd(transport);}
            catch(Exception recovery){failure.addSuppressed(recovery);}
            throw failure;
        }
    }
    private static boolean submitted(String status){return "queued".equals(status)||"processing".equals(status)||"published".equals(status)||"hidden".equals(status);}
    private static boolean recoveredAd(Transport transport){try{return transport.recoveredUploadAd();}catch(Exception ignored){return false;}}
    private CoverSubmission(){}
}
