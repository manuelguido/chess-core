<?php

use App\Http\Controllers\ChessController;
use Illuminate\Support\Facades\Route;

Route::get('/', ChessController::class)->name('chess.index');
