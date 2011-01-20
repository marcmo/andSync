package com.we.android.music;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.apache.http.HttpEntity;
import org.apache.http.HttpResponse;
import org.apache.http.HttpStatus;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.DefaultHttpClient;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;

public class MusicSync extends Activity {
    private static final String HOST = "http://www.coldflake.com:8080";

    @Override
    public void onCreate(Bundle savedInstanceState) {
	super.onCreate(savedInstanceState);
	setContentView(R.layout.main);

	File syncDir = new File(Environment.getExternalStorageDirectory(), "musicsync");
	if (!syncDir.exists()) {
	    syncDir.mkdir();
	}

	List<String> allFilesRelativeToSync = getFilesRelativeToFolder(syncDir, flattenDir(syncDir));

	JSONArray syncFolder = getSyncFolder(HOST + "/content");
	List<String> missingFiles = findMissingFiles(allFilesRelativeToSync, syncFolder);

	for (String missing : missingFiles) {
	    Log.d("MusicSync", "missing: " + missing + " downloading...");
	    try {
		downloadFile(missing);
	    } catch (Exception e) {
		e.printStackTrace();
	    }
	}
    }

    private List<String> getFilesRelativeToFolder(File folder, List<File> files) {
	int posPrefix = folder.getAbsolutePath().length();
	List<String> relativeToSync = new ArrayList<String>();
	for (File file : files) {
	    String relativeFileName = file.getAbsolutePath().substring(posPrefix);
	    relativeToSync.add(relativeFileName);
	}
	return relativeToSync;
    }

    private List<String> findMissingFiles(List<String> localFiles, JSONArray syncFolder) {
	Set<String> set = new HashSet<String>();
	for (String file : localFiles) {
	    set.add(file);
	}
	List<String> missingFiles = new ArrayList<String>();
	try {
	    for(int i=0; i<syncFolder.length();i++) {
		JSONObject fileInfo = syncFolder.getJSONObject(i);
		String file = fileInfo.getString("name");
		if (!set.contains(file)) {
		    missingFiles.add(file);
		}

		Log.d("MusicSync", "file: " + fileInfo.getString("name") + " size: " + fileInfo.getInt("size"));
	    } 
	} catch (JSONException e) {
	    e.printStackTrace();
	}
	return missingFiles;
    }

    private List<String> findIncompleteFiles(List<String> localFiles, JSONArray syncFolder) {
	return new ArrayList<String>();
    }

    private void downloadFile(String file) throws Exception {
	HttpClient httpclient = new DefaultHttpClient();
	String encoded = HOST + "/content/" + Uri.encode(file);
	HttpGet httpget = new HttpGet(encoded);
	HttpResponse response = httpclient.execute(httpget);

	if (response.getStatusLine().equals(HttpStatus.SC_OK)) {
	    HttpEntity entity = response.getEntity();
	    if (entity != null) {
		FileOutputStream fos = new FileOutputStream(file);
		BufferedInputStream input = new BufferedInputStream(entity.getContent());
		byte[] buffer = new byte[1000];
		int read = input.read(buffer);
		while (read != -1) {
		    fos.write(buffer, 0, read);
		    read = input.read(buffer);
		}
		input.close();
		fos.close();
	    }
	} else {
	    Log.i("MusicSync","download failed: " + response.getStatusLine().toString());
	}
    }

    private String convertStreamToString(InputStream is) {
	BufferedReader reader = new BufferedReader(new InputStreamReader(is));
	StringBuilder sb = new StringBuilder();

	String line = null;
	try {
	    while ((line = reader.readLine()) != null) {
		sb.append(line + "\n");
	    }
	} catch (IOException e) {
	    e.printStackTrace();
	} finally {
	    try {
		is.close();
	    } catch (IOException e) {
		e.printStackTrace();
	    }
	}
	return sb.toString();
    }

    private JSONArray getSyncFolder(String url) {
	HttpClient httpclient = new DefaultHttpClient();
	HttpGet httpget = new HttpGet(url);
	JSONArray files = null;
	try {
	    HttpResponse response = httpclient.execute(httpget);
	    Log.i("MusicSync",response.getStatusLine().toString());

	    HttpEntity entity = response.getEntity();
	    if (entity != null) {
		InputStream input = entity.getContent();
		String result = convertStreamToString(input);
		input.close();
		Log.i("MusicSync",result);
		files = new JSONArray(result);
	    }
	} catch (Exception e) {
	    e.printStackTrace();
	} 
	return files;
    }

    private List<File> flattenDir(File dir) {
	List<File> l = new ArrayList<File>();
	flatten(dir, l);
	return l;
    }

    private void flatten(File file, List<File> res) {
	if (file.isDirectory()) {
	    File[] files = file.listFiles();
	    for (File f : files) {
		flatten(f, res);
	    }
	} else {
	    res.add(file);
	}
    }
}