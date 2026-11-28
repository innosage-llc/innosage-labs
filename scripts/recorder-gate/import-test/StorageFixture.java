package co.innosage.labs.importfixture;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.Arrays;

// Installed only on the gate emulator. The OS verifies this test APK's signature
// against the app. It needs no permissions or product-side test switches.
public class StorageFixture extends Instrumentation {
  public void onCreate(Bundle args) {
    super.onCreate(args);
    Bundle result = new Bundle();
    try {
      File dir = new File(getTargetContext().getFilesDir(), "recordings");
      byte[] sentinel = "Library Import storage fixture".getBytes("UTF-8");
      switch (args.getString("mode", "")) {
        case "block":
          if (dir.isDirectory() && dir.list().length == 0 && !dir.delete()) throw new Exception("Fixture directory busy");
          if (!dir.createNewFile()) throw new Exception("Expected fresh Library");
          try (FileOutputStream out = new FileOutputStream(dir)) { out.write(sentinel); }
          break;
        case "unblock":
          if (!dir.isFile() || dir.length() != sentinel.length ||
              !Arrays.equals(java.nio.file.Files.readAllBytes(dir.toPath()), sentinel) || !dir.delete())
            throw new Exception("Unexpected fixture state");
          break;
        case "inspect":
          File[] files = dir.listFiles();
          if (files != null) {
            result.putString("count", Integer.toString(files.length));
            for (File file : files) {
              if (!file.getName().endsWith(".m4a")) continue;
              MessageDigest hash = MessageDigest.getInstance("SHA-256");
              try (FileInputStream in = new FileInputStream(file)) {
                byte[] block = new byte[8192];
                int n;
                while ((n = in.read(block)) != -1) hash.update(block, 0, n);
              }
              StringBuilder hex = new StringBuilder();
              for (byte b : hash.digest()) hex.append(String.format("%02x", b));
              result.putString("id", file.getName());
              result.putString("digest", hex.toString());
            }
          } else { result.putString("count", "0"); }
          break;
        default: throw new Exception("Unknown mode");
      }
      finish(Activity.RESULT_OK, result);
    } catch (Exception ex) {
      result.putString("failure", ex.toString());
      finish(Activity.RESULT_CANCELED, result);
    }
  }
}
