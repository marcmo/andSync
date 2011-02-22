package com.we.android.music;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Util {
    public static List<File> flattenDir(File dir) {
	List<File> l = new ArrayList<File>();
	flatten(dir, l);
	return l;
    }

    private static void flatten(File file, List<File> res) {
	if (file.isDirectory()) {
	    File[] files = file.listFiles();
	    for (File f : files) {
		flatten(f, res);
	    }
	} else {
	    res.add(file);
	}
    }
    
    public static String convertStreamToString(InputStream is) {
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
}
