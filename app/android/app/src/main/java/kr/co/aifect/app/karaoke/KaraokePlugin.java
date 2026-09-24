package kr.co.aifect.app.karaoke;

import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import kr.co.aifect.app.BuildConfig;

@CapacitorPlugin(name="AifectKaraoke")
public class KaraokePlugin extends Plugin {
    private boolean showing;
    @PluginMethod public void open(PluginCall call){
        getActivity().runOnUiThread(()->{
            if(showing){call.reject("이미 노래방이 열려 있어요.");return;}
            String configured=getBridge().getServerUrl(),current=getBridge().getWebView().getUrl(),trackId=call.getString("trackId");
            if(!KaraokeApi.trustedOrigin(configured,BuildConfig.DEBUG)||current==null||trackId==null||!trackId.matches("[\\w-]{1,80}")){call.reject("AIFECT 곡 페이지에서 다시 열어주세요.");return;}
            Uri live=Uri.parse(current),site=Uri.parse(configured);
            if(!site.getScheme().equals(live.getScheme())||!site.getAuthority().equals(live.getAuthority())){call.reject("AIFECT에서만 마이크를 사용할 수 있어요.");return;}
            showing=true;startActivityForResult(call,new Intent(getContext(),KaraokeActivity.class).putExtra("origin",configured.replaceAll("/$","")).putExtra("trackId",trackId),"closed");
        });
    }
    @ActivityCallback private void closed(PluginCall call,ActivityResult result){
        showing=false;if(call==null)return;
        JSObject value=new JSObject();value.put("uploadedId",result.getData()==null?null:result.getData().getStringExtra("uploadedId"));call.resolve(value);
    }
}
