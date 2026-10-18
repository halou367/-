package ai.arena.client;
import org.json.JSONObject;
/** JVM-only regression for the server-canonicalized password-login identity. */
public final class AuthLoginChecks {
    static JSONObject account() throws Exception { return new JSONObject().put("id","fixture").put("email","first.last@icloud.com").put("proxy","direct"); }
    static JSONObject begin(JSONObject a,String kind) throws Exception { return new JSONObject().put("op","begin").put("kind",kind).put("email",a.getString("email")).put("ip","203.0.113.9").put("expected",new JSONObject(a.toString())); }
    static JSONObject finish() throws Exception { return new JSONObject().put("op","finish").put("ticket","task").put("email","firstlast@icloud.com").put("ip","203.0.113.9"); }
    public static void main(String[] args) throws Exception {
        JSONObject a=account();
        AuthRouteState.task(a,begin(a,"login"),1000,"task","env");
        String route=AuthRouteState.signature(a);
        AuthRouteState.task(a,finish(),2000,"unused","env");
        if(AuthRouteState.locked(a)||!route.equals(AuthRouteState.signature(a)))throw new AssertionError("canonical login failed or changed route");
        for(String scenario:new String[]{"signup","ip","environment","ticket","expired"}) {
            a=account();AuthRouteState.task(a,begin(a,scenario.equals("signup")?"signup":"login"),1000,"task","env");
            JSONObject r=finish();if(scenario.equals("ip"))r.put("ip","203.0.113.8");if(scenario.equals("ticket"))r.put("ticket","other");
            boolean rejected=false;
            try{AuthRouteState.task(a,r,scenario.equals("expired")?2000000:2000,"unused",scenario.equals("environment")?"changed":"env");}catch(Exception expected){rejected=true;}
            if(!rejected||!AuthRouteState.locked(a))throw new AssertionError("guard lost: "+scenario);
        }
        System.out.println("PASS canonical login and 5 authentication guards");
    }
}
