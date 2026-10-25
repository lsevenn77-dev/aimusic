package kr.co.aifect.app.karaoke;

/** Publication intent is confirmed independently of the recording mode or original arrangement. */
final class CoverPublication {
    final String kind,mode,parent,slot;
    CoverPublication(String kind,String parent){
        this.parent=parent==null?"":parent;
        if(!kind.equals("solo")&&!kind.equals("duet_invitation")&&!kind.equals("duet_complete"))throw new IllegalArgumentException("공개할 종류를 선택해주세요.");
        if((!this.parent.isEmpty())!=kind.equals("duet_complete"))throw new IllegalArgumentException("파트너와 부른 녹음은 완성 듀엣으로 공개해주세요.");
        this.kind=kind;mode=kind.equals("solo")?"solo":"duet";slot=kind.equals("solo")?"":this.parent.isEmpty()?"first":"second";
    }
    void requireRecordingMode(String recordingMode){if(invitation()&&!"duet".equals(recordingMode))throw new IllegalArgumentException("듀엣 모드에서 내 파트를 녹음한 뒤 모집해주세요.");}
    String label(){return kind.equals("solo")?"솔로 커버":kind.equals("duet_invitation")?"듀엣 참여 모집":"완성 듀엣";}
    boolean invitation(){return kind.equals("duet_invitation");}
    void verify(String mode,String parent,String originalId,String expectedOriginal){
        if(!this.mode.equals(mode)||!this.parent.equals(parent==null?"":parent)||!expectedOriginal.equals(originalId))throw new IllegalStateException("저장된 공개 종류가 선택과 달라 중단했어요.");
    }
    static String legacy(String mode,String parent){return parent!=null&&!parent.isEmpty()?"duet_complete":mode.equals("duet")?"duet_invitation":"solo";}
}
