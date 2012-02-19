<?php

	$uploadName = 'screenshot';
	$uploadTo = dirname(__FILE__) . "/screenshots/";
	$filename = md5(mktime()) . ".png";
	
	if (!file_exists($uploadTo)) mkdir($uploadTo);
	
	if (array_key_exists($uploadName, $_FILES)) { // Upload via files
		move_uploaded_file($_FILES[$uploadName]['tmp_name'], $uploadTo . $filename);
	} elseif (array_key_exists($uploadName, $_POST)) { // Upload via dataURI
		$fileData = substr($_POST[$uploadName], strpos($_POST[$uploadName], ",") + 1);
		$fileData = base64_decode($fileData);
		file_put_contents($uploadTo . $filename, $fileData);
	}
	
	echo "ok";