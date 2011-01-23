package com.we.android.music;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
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
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MusicSync extends Activity {
    private static final String HOST = "http://www.coldflake.com:8080";
    public File mlocalSyncFolder;

    private class DownloadTask {
	String mFile;
	int mSize;
	int mDownloadedSize;

	public DownloadTask(String uri, int totalSize, int downloadedSize) {
	    mFile = uri;
	    mSize = totalSize;
	    mDownloadedSize = downloadedSize;
	}
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
	super.onCreate(savedInstanceState);
	setContentView(R.layout.main);

	mlocalSyncFolder = new File(Environment.getExternalStorageDirectory(), "musicsync");
	if (!mlocalSyncFolder.exists()) {
	    mlocalSyncFolder.mkdir();
	}

	List<String> allFilesRelativeToSync = getFilesRelativeToFolder(mlocalSyncFolder, flattenDir(mlocalSyncFolder));

	JSONArray syncFolder = getSyncFolder(HOST + "/content");
	List<DownloadTask> downloadTasks = findMissingFiles(allFilesRelativeToSync, syncFolder);

	DownloadTask[] tasks = downloadTasks.toArray(new DownloadTask[downloadTasks.size()]);
	new Downloader().execute(tasks);
    }

    private List<String> getFilesRelativeToFolder(File folder, List<File> files) {
	// remove leading /
	int posPrefix = folder.getAbsolutePath().length() + 1;
	List<String> relativeToSync = new ArrayList<String>();
	for (File file : files) {
	    String relativeFileName = file.getAbsolutePath().substring(posPrefix);
	    relativeToSync.add(relativeFileName);
	}
	return relativeToSync;
    }

    private List<DownloadTask> findMissingFiles(List<String> localFiles, JSONArray syncFolder) {
	Set<String> set = new HashSet<String>();
	for (String file : localFiles) {
	    set.add(file);
	}
	List<DownloadTask> missingFiles = new ArrayList<DownloadTask>();
	try {
	    for(int i=0; i<syncFolder.length();i++) {
		JSONObject fileInfo = syncFolder.getJSONObject(i);
		String file = fileInfo.getString("name");
		int size = fileInfo.getInt("size");
		if (!set.contains(file)) {
		    missingFiles.add(new DownloadTask(file, size, 0));
		}
		Log.d("MusicSync", "remote file: " + file + " size: " + size);
	    } 
	} catch (JSONException e) {
	    e.printStackTrace();
	}
	return missingFiles;
    }

    class Downloader extends AsyncTask<DownloadTask, Integer, Void> {
	private ProgressBar mProgress;
	private TextView mInfo;
	private TextView mPercentage;
	private Button mButton;
	private TextView mResult;

	@Override
	protected void onPreExecute() {
	    mProgress = (ProgressBar) findViewById(R.id.progressbar);
	    mInfo = (TextView) findViewById(R.id.info);
	    mPercentage = (TextView) findViewById(R.id.percentage);
	    mResult = (TextView) findViewById(R.id.result);
	    mButton = (Button) findViewById(R.id.cancelbutton);
	    mButton.setVisibility(View.VISIBLE);
	    mButton.setOnClickListener(new OnClickListener() {
		@Override
		public void onClick(View v) {
		    cancel(false);
		    mButton.setVisibility(View.GONE);
		}
	    });
	    super.onPreExecute();
	}

	@Override
	protected Void doInBackground(DownloadTask... tasks) {
	    for (final DownloadTask task : tasks) {
		HttpClient httpclient = new DefaultHttpClient();
		String encoded = HOST + "/content/" + Uri.encode(task.mFile);
		HttpGet httpget = new HttpGet(encoded);
		try {
		    HttpResponse response = httpclient.execute(httpget);
		    Log.i("MusicSync", response.getStatusLine().toString());

		    if (response.getStatusLine().getStatusCode() == HttpStatus.SC_OK) {
			HttpEntity entity = response.getEntity();
			if (entity != null) {
			    runOnUiThread(new Runnable() {
				@Override
				public void run() {
				    mInfo.setText("Download: " + task.mFile);
				    mProgress.setMax(100);
				}
			    });	
			    FileOutputStream output = new FileOutputStream(new File(mlocalSyncFolder, task.mFile));
			    BufferedInputStream input = new BufferedInputStream(entity.getContent());
			    download(input, output, task.mSize);
			    if (isCancelled()) break;
			}
		    } else {
			Log.i("MusicSync","download failed: " + response.getStatusLine().toString());
		    }
		} catch(Exception e) {
		}
	    }
	    return null;
	}

	private void download(InputStream is, OutputStream os, int totalSize) throws Exception {
	    byte[] buffer = new byte[5000];
	    int counter = 0;
	    int read = is.read(buffer);
	    while (!isCancelled() && (read != -1)) {
		counter += read;
		int percentPerFile = (int) ((counter / (float) totalSize) * 100);
		publishProgress(percentPerFile);
		os.write(buffer, 0, read);
		read = is.read(buffer);
	    }
	    is.close();
	    os.close();
	}

	@Override
	protected void onProgressUpdate(Integer... values) {
	    mProgress.setProgress(values[0]);
	    mPercentage.setText(values[0] + "%");
	    super.onProgressUpdate(values);
	}

	@Override
	protected void onCancelled() {
	    mButton.setVisibility(View.GONE);
	    mResult.setText("canceld...");
	    super.onCancelled();
	}

	@Override
	protected void onPostExecute(Void result) {
	    mButton.setVisibility(View.GONE);
	    mResult.setText("all files synced.");
	    super.onPostExecute(result);
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